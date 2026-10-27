import { spawnSync } from "node:child_process";
import { unstable_readConfig } from "wrangler";
import { CLOUDFLARE_ACCOUNT_ID, checkDeployedBindings, checkResourceBindings } from "./check-resource-bindings.mjs";
import { R2_INCLUDED, checkBucketSafety, summarizeR2Usage } from "./r2-audit-policy.mjs";
import { inspectBillingConfiguration } from "./r2-billing-policy.mjs";

// Read-only metadata GETs and a GraphQL POST containing only an analytics query.
// No object reads, uploads, deletion, subscription changes, or deployment.
// Exit 1: unsafe/unreadable resources. Exit 2: incomplete billing verification/warnings.
// Exit 0 is reserved for a complete snapshot, NEVER a spending cap or billing guarantee.
// These generic APIs cannot close the Workers-tier/account-budget operator gates;
// successful access alone therefore still produces exit 2 (or 1 for resource errors).
async function main() {
  const configs = ["", "dev"].map(environment => {
    const config = unstable_readConfig({ config: "wrangler.jsonc", env: environment });
    checkResourceBindings(config, environment);
    return config;
  });
  let token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    const result = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "auth", "token", "--json"], {
      encoding: "utf8", timeout: 30_000, windowsHide: true,
    });
    if (result.status !== 0) throw new Error("Wrangler authentication lookup failed");
    try { token = JSON.parse(result.stdout).token; } catch { throw new Error("Wrangler authentication response is invalid"); }
  }
  if (typeof token !== "string" || !token) throw new Error("Cloudflare authentication is required");
  async function read(path) {
    let response;
    try {
      response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/${path}`, {
        headers: { authorization: `Bearer ${token}` }, redirect: "error", signal: AbortSignal.timeout(20_000),
      });
      const body = await response.json();
      return { ok: response.ok && body?.success === true, status: response.status, result: body?.result, resultInfo: body?.result_info };
    } catch {
      // Optional billing access failure must not suppress the remaining snapshot
      // or print arbitrary API/HTML content; required resources still fail below.
      return { ok: false, status: response?.status ?? null };
    }
  }
  async function required(path) {
    const response = await read(path);
    if (!response.ok) throw new Error(`Cloudflare resource inspection failed (HTTP ${response.status}): ${path}`);
    return response.result;
  }
  const errors = [], warnings = [];
  const buckets = [];
  for (const config of configs) {
    const name = config.r2_buckets.find(binding => binding.binding === "PROOFS").bucket_name;
    const base = `r2/buckets/${name}`;
    const [info, managed, custom, lifecycle, sippy] = await Promise.all([
      required(base), required(`${base}/domains/managed`), required(`${base}/domains/custom`), required(`${base}/lifecycle`), required(`${base}/sippy`),
    ]);
    const problems = checkBucketSafety({ info, managed, custom, lifecycle, sippy });
    errors.push(...problems.map(problem => `${name}: ${problem}`));
    buckets.push({ name, storageClass: info.storage_class, publicAccess: managed.enabled, customDomains: custom.domains.length, automaticImports: sippy.enabled, problems });
  }
  const workers = [];
  for (const config of configs) {
    const deployments = await required(`workers/scripts/${config.name}/deployments`);
    const active = deployments.deployments.toSorted((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
    if (!active?.versions?.length) throw new Error(`No active deployment found: ${config.name}`);
    for (const version of active.versions) {
      const metadata = await required(`workers/scripts/${config.name}/versions/${version.version_id}`);
      const bindings = metadata.resources?.bindings;
      if (!Array.isArray(bindings)) throw new Error(`No binding metadata: ${config.name}`);
      const proofs = bindings.find(binding => binding.name === "PROOFS");
      errors.push(...checkDeployedBindings(config, bindings).map(problem => `${config.name} (${version.version_id}): ${problem}`));
      workers.push({ name: config.name, version: version.version_id, trafficPercent: version.percentage, proofBucket: proofs?.bucket_name ?? null });
    }
  }
  const now = new Date();
  // Billing-cycle dates may be unavailable. A rolling 31-day window conservatively
  // includes a complete monthly cycle; calendar-month resets could undercount usage.
  const start = new Date(now.getTime() - 31 * 86_400_000);
  const query = `query($accountTag:string!,$start:Time,$end:Time){viewer{accounts(filter:{accountTag:$accountTag}){
    r2OperationsAdaptiveGroups(limit:10000,filter:{datetime_geq:$start,datetime_leq:$end}){sum{requests} dimensions{actionType}}
    r2StorageAdaptiveGroups(limit:10000,filter:{datetime_geq:$start,datetime_leq:$end},orderBy:[datetime_DESC]){max{payloadSize metadataSize} dimensions{bucketName datetime}}
  }}}`;
  const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { accountTag: CLOUDFLARE_ACCOUNT_ID, start: start.toISOString(), end: now.toISOString() } }),
    signal: AbortSignal.timeout(20_000),
  });
  const analytics = await response.json();
  if (!response.ok || analytics.errors?.length || analytics.data?.viewer?.accounts?.length !== 1) {
    throw new Error(`Account R2 analytics could not be verified (HTTP ${response.status}); provider errors or account data unavailable`);
  }
  const data = analytics.data.viewer.accounts[0];
  const usage = summarizeR2Usage(data.r2OperationsAdaptiveGroups, data.r2StorageAdaptiveGroups);
  warnings.push(...usage.warnings);
  const [subscriptions, alerts] = await Promise.all([read("subscriptions"), read("alerting/v3/policies")]);
  const billingConfiguration = inspectBillingConfiguration(subscriptions, alerts);
  warnings.push(...billingConfiguration.warnings);
  console.log(JSON.stringify({
    checkedAt: now.toISOString(), account: CLOUDFLARE_ACCOUNT_ID, buckets, workers,
    accountUsage: { from: start.toISOString(), to: now.toISOString(), ...usage }, includedStandardUsage: R2_INCLUDED,
    billingVerificationAvailable: subscriptions.ok, notificationPolicyApiAvailable: alerts.ok,
    budgetAlertVerificationAvailable: false,
    billing: billingConfiguration.billing, notifications: billingConfiguration.notifications,
    freePlanVerified: false, budgetAlertVerified: false,
    noChargeGuarantee: false,
    limitations: "Analytics can lag. Empty storage samples mean no observed data, not an invoice. Shared account allowance; other buckets and deleted buckets count. Budget alerts do not stop usage. This command does not enforce runtime quotas or a hard spending cap.",
    errors, warnings,
  }, null, 2));
  process.exitCode = errors.length ? 1 : warnings.length ? 2 : 0;
}
main().catch(error => { console.error(`R2 audit incomplete: ${error.message}. No billing assurance can be given.`); process.exitCode = 1; });
