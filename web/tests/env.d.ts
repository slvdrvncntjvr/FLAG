declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    MIGRATION_DB: D1Database;
    PROOFS: R2Bucket;
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
