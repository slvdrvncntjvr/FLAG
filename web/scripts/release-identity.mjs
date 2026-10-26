import assert from "node:assert/strict";
import { parseArgs } from "node:util";

const versionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isVersionId = value => typeof value === "string" && value.length === 36 && versionIdPattern.test(value);
export const releaseVerificationUsage = "Usage: npm run verify:dev -- --expected-version <full Worker version UUID> | --health-only";

export function parseReleaseOptions(args) {
  const { values, tokens } = parseArgs({
    args, strict: true, allowPositionals: false, tokens: true,
    options: { "expected-version": { type: "string" }, "health-only": { type: "boolean" } },
  });
  assert.equal(new Set(tokens.map(token => token.name)).size, tokens.length, "Duplicate verification options are not allowed");
  const expectedVersion = values["expected-version"];
  const healthOnly = values["health-only"] === true;
  assert.ok(!(healthOnly && expectedVersion !== undefined), "--health-only and --expected-version cannot be combined");
  assert.ok(healthOnly || isVersionId(expectedVersion),
    `Release verification requires --expected-version with a full Worker version UUID. ${releaseVerificationUsage}`);
  return { expectedVersion, healthOnly };
}

// Select the latest deployment, including reactivations of an older version.
// Never substitute a candidate merely because it appears in deployment history.
export function checkActiveRelease(result, expectedVersion) {
  const deployments = result?.deployments;
  assert.ok(Array.isArray(deployments) && deployments.length > 0, "Active dev deployment metadata is unavailable");
  assert.ok(deployments.every(deployment => typeof deployment?.created_on === "string" &&
    Number.isFinite(Date.parse(deployment.created_on))), "Invalid dev deployment timestamps");
  const active = deployments.toSorted((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
  assert.equal(deployments.filter(deployment => Date.parse(deployment.created_on) === Date.parse(active.created_on)).length,
    1, "Ambiguous latest dev deployment timestamps");
  assert.ok(Array.isArray(active.versions) && active.versions.length === 1, "Expected one active dev version");
  assert.equal(active.versions[0]?.percentage, 100, "Expected the active dev version at 100 percent");
  const versionId = active.versions[0]?.version_id;
  assert.ok(isVersionId(versionId), "Invalid active dev Worker version UUID");
  if (expectedVersion !== undefined) {
    assert.ok(isVersionId(expectedVersion), "Invalid expected Worker version UUID");
    assert.equal(versionId, expectedVersion, `Active dev Worker version mismatch: expected ${expectedVersion}, active ${versionId}`);
  }
  return versionId;
}
