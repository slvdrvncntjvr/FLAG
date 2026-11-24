import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CLOUDFLARE_ACCOUNT_ID } from './check-resource-bindings.mjs';
import { parseLocalConfig } from './setup-local.mjs';

export function checkLocal(config, version, env) {
  const problems = [];
  if (version !== 'v24.22.1') problems.push('Use pinned Node 24.22.1; check node --version after selecting it.');
  let entries = new Map();
  try { entries = parseLocalConfig(config); }
  catch (error) { problems.push(error.message); }
  const value = name => entries.get(name)?.value ?? '';
  if (value('BETTER_AUTH_URL') !== 'http://localhost:3000') problems.push('Set BETTER_AUTH_URL to http://localhost:3000 using setup-local.mjs --repair-url.');
  if (!value('BETTER_AUTH_SECRET')) problems.push('BETTER_AUTH_SECRET is missing or empty; supply a private local secret without replacing existing credentials.');
  if (env.CLOUDFLARE_ACCOUNT_ID !== CLOUDFLARE_ACCOUNT_ID || (env.CF_ACCOUNT_ID && env.CF_ACCOUNT_ID !== CLOUDFLARE_ACCOUNT_ID)) {
    problems.push('Explicitly select the approved CLOUDFLARE_ACCOUNT_ID from the README; remove a conflicting legacy CF_ACCOUNT_ID.');
  }
  return { problems, mail: Boolean(value('BREVO_API_KEY') || value('RESEND_API_KEY')) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { problems, mail } = checkLocal(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8'), process.version, process.env);
    for (const problem of problems) console.error(problem);
    if (problems.length) process.exitCode = 1;
    else console.log(`Local configuration ready. ${mail ? 'Mail keys present: OTP uses real email; credentials preserved.' : 'Mail keys absent: localhost OTP appears in the dev-server console.'}`);
  } catch {
    console.error('Cannot read .dev.vars; run node scripts/setup-local.mjs first.');
    process.exitCode = 1;
  }
}
