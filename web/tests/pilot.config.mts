import config from "../vitest.config.mts";
import { defineConfig } from "vitest/config";

export default defineConfig({ ...config, test: { ...config.test, setupFiles: [], include: ["tests/pilot-*.test.ts"] } });
