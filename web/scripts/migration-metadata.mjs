import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { compileFunction } from "node:vm";
import ts from "typescript";

export const schemaPath = fileURLToPath(new URL("../src/server/db/schema.ts", import.meta.url));

// Reconstruct the additive 0008 boundary from the schema's declarations, before
// Drizzle serializes columns, indexes, FKs and checks. Never patch a snapshot to
// hide a generator difference. These five declarations were introduced by 0009.
export function schemaThrough0008(source = readFileSync(schemaPath, "utf8")) {
  for (const declaration of ["draftUpdatedAt:", "purgeAttempts:", "purgeInflight:",
    'check("proof_file_purge_attempts_check",', 'check("proof_file_purge_inflight_check",']) {
    const lines = source.split("\n");
    assert.equal(lines.filter(line => line.trimStart().startsWith(declaration)).length, 1,
      `Expected one 0009 declaration: ${declaration}`);
    source = lines.filter(line => !line.trimStart().startsWith(declaration)).join("\n");
  }
  return source;
}

export function loadSchema(source = readFileSync(schemaPath, "utf8")) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: schemaPath,
  });
  const compiledModule = { exports: {} };
  compileFunction(outputText, ["exports", "require", "module"], { filename: schemaPath })(
    compiledModule.exports, createRequire(schemaPath), compiledModule,
  );
  return compiledModule.exports;
}

// Match drizzle-kit's writeResult persistence: JSON drops undefined properties;
// the CLI adds an empty schemas map to _meta even for SQLite (the SQLite API
// returns only tables/columns). Preserve and compare every other property.
export function serializedSnapshot(snapshot) {
  return JSON.parse(JSON.stringify({ ...snapshot, _meta: { schemas: {}, ...snapshot._meta } }));
}

export function representation(snapshot) {
  const supported = serializedSnapshot(snapshot);
  delete supported.id;
  delete supported.prevId;
  return supported;
}
