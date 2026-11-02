import config from "../vitest.config.mts";
import { defineConfig } from "vitest/config";

// Schema-only rehearsals own their isolated migration binding and load it themselves.
export default defineConfig({ ...config, test: { ...config.test, setupFiles: [], include: ["tests/pilot-*.test.ts"] } });
