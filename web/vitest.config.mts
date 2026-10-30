import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: {
    "@": path.resolve(import.meta.dirname, "src"),
    // Workers tests execute the server modules directly, outside Next's RSC resolver.
    "server-only": path.resolve(import.meta.dirname, "node_modules/next/dist/compiled/server-only/empty.js"),
  } },
  plugins: [
    cloudflareTest(async () => ({
      miniflare: {
        compatibilityDate: "2026-10-01",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: ["DB", "MIGRATION_DB"],
        r2Buckets: ["PROOFS"],
        bindings: { PRIVATE_INTAKE_ENABLED: "true", TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "drizzle")) },
      },
    })),
  ],
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/apply-migrations.ts"],
  },
});
