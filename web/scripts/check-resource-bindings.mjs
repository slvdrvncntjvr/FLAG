// Keep private proofs isolated alongside the existing database and auth boundary.
export const CLOUDFLARE_ACCOUNT_ID = "1af65da586efd62d6f6d429240395f28";

export function getDeploymentTarget(environment) {
  if (environment !== undefined && environment !== "" && environment !== "dev") {
    throw new Error("Unsupported deployment environment");
  }
  const dev = environment === "dev";
  const worker = dev ? "flag-dev" : "flag";
  const database = dev ? "flag-db-dev" : "flag-db";
  const databaseId = dev ? "54aca5df-2ae7-4150-bd75-0f6365e5bfa3" : "e196d1b5-82e7-45bf-b1c5-725fa1faf184";
  const bucket = dev ? "flag-proofs-dev" : "flag-proofs";
  return { worker, database, databaseId, bucket, authUrl: `https://${worker}.factsfirst.workers.dev`, branch: dev ? "dev" : "main" };
}

export function checkResourceBindings(config, environment) {
  const { worker, database, databaseId, bucket, authUrl } = getDeploymentTarget(environment);
  if (config.account_id !== CLOUDFLARE_ACCOUNT_ID) {
    throw new Error("Cloudflare account does not match the approved FLAG account");
  }
  if (config.name !== worker || config.vars?.BETTER_AUTH_URL !== authUrl ||
      config.d1_databases?.find(binding => binding.binding === "DB")?.database_name !== database ||
      config.d1_databases?.find(binding => binding.binding === "DB")?.database_id !== databaseId ||
      config.r2_buckets?.find(binding => binding.binding === "PROOFS")?.bucket_name !== bucket) {
    throw new Error("Worker, database, authentication URL, and private proof bucket do not match the selected environment");
  }
  const proofBucket = config.r2_buckets.find(binding => binding.binding === "PROOFS");
  // Local development and remote previews must never accidentally use production proofs.
  if (proofBucket.remote === true || proofBucket.preview_bucket_name) {
    throw new Error("Proof storage must use local development storage without a remote preview bucket");
  }
}

// Both release verification and the R2 audit must reject absent or swapped bindings.
export function checkDeployedBindings(config, bindings) {
  if (!Array.isArray(bindings)) return ["Deployed binding metadata is unavailable"];
  const problems = [];
  const expectedDatabase = config.d1_databases?.find(binding => binding.binding === "DB");
  const expectedProofs = config.r2_buckets?.find(binding => binding.binding === "PROOFS");
  const named = name => bindings.filter(binding => binding?.name === name);
  const [db] = named("DB");
  const [proofs] = named("PROOFS");
  const [url] = named("BETTER_AUTH_URL");
  if (named("DB").length !== 1 || db?.type !== "d1" || !expectedDatabase?.database_id ||
      (db?.database_id ?? db?.id) !== expectedDatabase.database_id) {
    problems.push("Deployed database binding is missing or does not match the selected environment");
  }
  if (named("PROOFS").length !== 1 || proofs?.type !== "r2_bucket" || !expectedProofs?.bucket_name ||
      proofs?.bucket_name !== expectedProofs.bucket_name) {
    problems.push("Deployed PROOFS binding is missing or does not match the selected environment");
  }
  if (named("BETTER_AUTH_URL").length !== 1 || url?.type !== "plain_text" || !config.vars?.BETTER_AUTH_URL ||
      url?.text !== config.vars.BETTER_AUTH_URL) {
    problems.push("Deployed authentication URL is missing or does not match the selected environment");
  }
  return problems;
}
