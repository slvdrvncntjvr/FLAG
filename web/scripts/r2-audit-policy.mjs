// Standard R2 included usage, verified 2026-10-20:
// https://developers.cloudflare.com/r2/pricing/
// These are ACCOUNT totals, not an allowance for each bucket/Worker.
export const R2_INCLUDED = { classA: 1_000_000, classB: 10_000_000, storageBytes: 10_000_000_000 };
const classA = new Set(["ListBuckets", "PutBucket", "ListObjects", "PutObject", "CopyObject", "CompleteMultipartUpload", "CreateMultipartUpload", "LifecycleStorageTierTransition", "ListMultipartUploads", "UploadPart", "UploadPartCopy", "ListParts", "PutBucketEncryption", "PutBucketCors", "PutBucketLifecycleConfiguration"]);
const classB = new Set(["HeadBucket", "HeadObject", "GetObject", "UsageSummary", "GetBucketEncryption", "GetBucketLocation", "GetBucketCors"]);
const free = new Set(["DeleteObject", "DeleteBucket", "AbortMultipartUpload"]);
function count(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error("R2 analytics contains an invalid numeric value");
  return value;
}

export function summarizeR2Usage(operations, storage) {
  if (!Array.isArray(operations) || !Array.isArray(storage) || operations.length >= 10_000 || storage.length >= 10_000) {
    throw new Error("R2 analytics is missing or may be truncated; usage is unverified");
  }
  const totals = { classA: 0, classB: 0, free: 0 };
  const unknownOperations = [];
  for (const row of operations) {
    const action = row.dimensions?.actionType;
    const requests = count(row.sum?.requests);
    if (classA.has(action)) totals.classA += requests;
    else if (classB.has(action)) totals.classB += requests;
    else if (free.has(action)) totals.free += requests;
    else unknownOperations.push({ action, requests });
  }
  // Conservative upper bound: sum each bucket's peak over the lookback, including
  // deleted buckets. Do not sum every time sample or treat the latest bucket as the account.
  const peaks = new Map();
  for (const row of storage) {
    if (typeof row.dimensions?.bucketName !== "string") throw new Error("R2 analytics lacks a bucket name");
    const bytes = count(row.max?.payloadSize) + count(row.max?.metadataSize);
    peaks.set(row.dimensions.bucketName, Math.max(peaks.get(row.dimensions.bucketName) ?? 0, bytes));
  }
  const storageBytes = [...peaks.values()].reduce((sum, value) => sum + value, 0);
  const unclassifiedRequests = unknownOperations.reduce((sum, row) => sum + row.requests, 0);
  const conservativeClassA = totals.classA + unclassifiedRequests;
  const conservativeClassB = totals.classB + unclassifiedRequests;
  const warnings = [];
  for (const key of ["classA", "classB", "storageBytes"]) {
    const observed = key === "storageBytes" ? storageBytes : key === "classA" ? conservativeClassA : conservativeClassB;
    if (observed >= R2_INCLUDED[key] * 0.8) warnings.push(`${key} has reached 80% of the shared included allowance`);
  }
  if (unknownOperations.length) warnings.push("Unclassified R2 operations require review; do not assume they are free");
  return { ...totals, conservativeClassA, conservativeClassB, storageBytesUpperBound: storageBytes, storageSamples: storage.length, unknownOperations, warnings };
}

export function checkBucketSafety({ info, managed, custom, lifecycle, sippy }) {
  const problems = [];
  if (info?.storage_class !== "Standard") problems.push("Bucket storage class is not verified as Standard");
  if (managed?.enabled !== false) problems.push("Public r2.dev access is enabled or unverified");
  if (!Array.isArray(custom?.domains) || custom.domains.length) problems.push("Custom domains exist or are unverified");
  if (sippy?.enabled !== false) problems.push("Sippy automatic imports are enabled or unverified");
  if (!Array.isArray(lifecycle?.rules)) problems.push("Lifecycle rules are unverified");
  else for (const rule of lifecycle.rules) {
    if (!rule.enabled) continue;
    if (rule.storageClassTransitions?.length) problems.push("Lifecycle can move objects into billable Infrequent Access storage");
    if (rule.deleteObjectsTransition) problems.push("Automatic object deletion bypasses the application's retention/hold assessment");
  }
  return problems;
}
