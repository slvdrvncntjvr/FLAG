// Keep private proofs isolated alongside the existing database and auth boundary.
export const CLOUDFLARE_ACCOUNT_ID = "1af65da586efd62d6f6d429240395f28";

export function checkResourceBindings(config, environment) {
  if (environment !== undefined && environment !== "" && environment !== "dev") {
    throw new Error("Unsupported deployment environment");
  }
  const dev = environment === "dev";
  const worker = dev ? "flag-dev" : "flag";
  const database = dev ? "flag-db-dev" : "flag-db";
  const bucket = dev ? "flag-proofs-dev" : "flag-proofs";
  if (config.account_id !== CLOUDFLARE_ACCOUNT_ID) {
    throw new Error("Cloudflare account does not match the approved FLAG account");
  }
  if (config.name !== worker || config.vars?.BETTER_AUTH_URL !== `https://${worker}.factsfirst.workers.dev` ||
      config.d1_databases?.find(binding => binding.binding === "DB")?.database_name !== database ||
      config.r2_buckets?.find(binding => binding.binding === "PROOFS")?.bucket_name !== bucket) {
    throw new Error("Worker, database, authentication URL, and private proof bucket do not match the selected environment");
  }
  const proofBucket = config.r2_buckets.find(binding => binding.binding === "PROOFS");
  // Local development and remote previews must never accidentally use production proofs.
  if (proofBucket.remote === true || proofBucket.preview_bucket_name) {
    throw new Error("Proof storage must use local development storage without a remote preview bucket");
  }
}
