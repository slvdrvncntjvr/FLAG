import assert from "node:assert/strict";
import { test } from "node:test";
import { checkBucketSafety, summarizeR2Usage } from "./r2-audit-policy.mjs";
const operation = (actionType, requests) => ({ dimensions: { actionType }, sum: { requests } });
const sample = (bucketName, payloadSize, metadataSize = 0) => ({ dimensions: { bucketName }, max: { payloadSize, metadataSize } });
const privateBucket = () => ({ info: { storage_class: "Standard" }, managed: { enabled: false }, custom: { domains: [] }, lifecycle: { rules: [{ enabled: true, abortMultipartUploadsTransition: { condition: { type: "Age", maxAge: 604800 } } }] }, sippy: { enabled: false } });

test("aggregates operation totals across the account, keeping deletes free", () => {
  const result = summarizeR2Usage([operation("PutObject", 400_000), operation("PutObject", 400_001), operation("GetObject", 5), operation("DeleteObject", 20)], []);
  assert.equal(result.classA, 800_001);
  assert.equal(result.classB, 5);
  assert.equal(result.free, 20);
  assert.equal(result.warnings.length, 1);
});
test("storage sums per-bucket peaks including metadata and deleted buckets", () => {
  const result = summarizeR2Usage([], [sample("flag-proofs", 4e9, 100), sample("flag-proofs", 2e9), sample("flag-proofs-dev", 3e9), sample("deleted", 1e9)]);
  assert.equal(result.storageBytesUpperBound, 8e9 + 100);
  assert.equal(result.warnings.length, 1);
});
test("unknown operation types are surfaced rather than assumed free", () => {
  const result = summarizeR2Usage([operation("FuturePaidOperation", 1)], []);
  assert.equal(result.unknownOperations.length, 1);
  assert.equal(result.conservativeClassA, 1);
  assert.equal(result.conservativeClassB, 1);
  assert.equal(result.warnings.length, 1);
});
test("missing, invalid, or potentially truncated analytics fails closed", () => {
  for (const data of [undefined, null, Array(10_000).fill(operation("GetObject", 1))]) assert.throws(() => summarizeR2Usage(data, []));
  for (const value of [-1, NaN, undefined, "0"]) assert.throws(() => summarizeR2Usage([operation("GetObject", value)], []));
  assert.throws(() => summarizeR2Usage([], [sample(undefined, 1)]));
});
test("private Standard buckets may retain multipart-abort cleanup", () => {
  assert.deepEqual(checkBucketSafety(privateBucket()), []);
});
test("rejects public access, unknown visibility, imports, and billable storage class", () => {
  for (const changed of [{ info: { storage_class: "InfrequentAccess" } }, { managed: { enabled: true } }, { managed: {} }, { custom: { domains: [{}] } }, { sippy: { enabled: true } }]) {
    assert.ok(checkBucketSafety({ ...privateBucket(), ...changed }).length);
  }
});
test("rejects automatic storage transitions and deletion that bypasses holds", () => {
  for (const rule of [{ enabled: true, storageClassTransitions: [{}] }, { enabled: true, deleteObjectsTransition: {} }]) {
    assert.ok(checkBucketSafety({ ...privateBucket(), lifecycle: { rules: [rule] } }).length);
  }
  assert.equal(checkBucketSafety({ ...privateBucket(), lifecycle: { rules: [{ enabled: false, deleteObjectsTransition: {} }] } }).length, 0);
});
