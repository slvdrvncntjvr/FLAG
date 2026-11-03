import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import { loadSchema, representation, schemaPath } from "./migration-metadata.mjs";

const web = fileURLToPath(new URL("../", import.meta.url));
const migrations = path.join(web, "drizzle");
const meta = path.join(migrations, "meta");
const json = file => JSON.parse(readFileSync(file, "utf8"));
const snapshot = number => json(path.join(meta, `${number.toString().padStart(4, "0")}_snapshot.json`));
const sqlFiles = folder => readdirSync(folder).filter(name => name.endsWith(".sql")).sort();
const hash = file => createHash("sha256").update(readFileSync(file)).digest("hex");

// Fixed SHA256s of tracked SQL with only CRLF pairs converted to LF. Preserve
// every other byte (including bare CR, BOM and whitespace); do not decode UTF-8.
// Git checkout line endings may vary, but historical SQL content must not.
const publishedContentHash = bytes => createHash("sha256")
  .update(bytes.filter((byte, index) => byte !== 13 || bytes[index + 1] !== 10)).digest("hex");
const published = {
  "0000_init.sql": "ccbdf47104ecfd84d00700970e1ec56d9aa2df7e79871eb47a6861e933656322",
  "0001_triggers.sql": "4406970708512ce3826be721170d48a3cfdd2c10ff0827e2a9552447fcf48297",
  "0002_pink_colossus.sql": "5e71d71c09cef9d040fd4fa014c061a976f31b632bf8b84037a21bf2e97fb4a4",
  "0003_melted_the_twelve.sql": "5a3d4e85b0591df91f4aafb18c3b7699dfeb6824ee46719d2f27d57cd383c5d2",
  "0004_clever_arclight.sql": "12177289b6a018330cbe0ee934ac0a717ad1f54271e57b775c9d88f67a296e24",
  "0005_happy_vermin.sql": "81cce6b4286b1e57133a999e87c5d24fb99a8bb12f3ce67317020651e84d8019",
  "0006_verification_review.sql": "3c34a504f38ee8996fe324ad97f191f18122dcbde19deadf42a0faa3eacc93d7",
  "0007_verification_submitted_profile.sql": "66be5b23abaa2278b9fab52675da8f4608001fb2cff2ba8dd69e7ba9e433a55d",
  "0008_engagement_consent.sql": "c388da6d70efacbc7d6f029be0c7b129f232c2ae65b9c9f0d9964f0a25fe4ede",
  "0009_private_log_intake.sql": "7937c4ebbe256ce01a6708c0d4aba6767e78ea0ab819087c85a4dacc7462565c",
  "0010_pilot_lifecycle_schema.sql": "145eff35fc2d43ac8a83a078000fcd64cd2486126c358aee96758fc1ba978370",
  "0011_pilot_guards.sql": "6da870262ddbd41e5fb86c4063749849023932a21871e49fbce37aa52683aaeb",
};

const assertPublishedContent = folder => {
  for (const [file, digest] of Object.entries(published)) {
    assert.equal(publishedContentHash(readFileSync(path.join(folder, file))), digest, file);
  }
};

test("source SQL including handwritten trigger bodies matches fixed LF content hashes", () => {
  assertPublishedContent(migrations);
});

test("published-content check accepts LF and CRLF fixtures and rejects other byte changes in both", () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "flag-published-content-"));
  try {
    for (const ending of ["\n", "\r\n"]) {
      for (const file of Object.keys(published)) {
        // Latin-1 is a reversible byte mapping, used only to construct fixtures.
        const lf = readFileSync(path.join(migrations, file)).toString("latin1").replaceAll("\r\n", "\n");
        writeFileSync(path.join(sandbox, file), Buffer.from(lf.replaceAll("\n", ending), "latin1"));
      }
      assert.equal(readFileSync(path.join(sandbox, "0000_init.sql")).includes(Buffer.from("\r\n")), ending === "\r\n");
      assertPublishedContent(sandbox);
      for (const file of Object.keys(published)) {
        const target = path.join(sandbox, file);
        const original = readFileSync(target);
        const changed = Buffer.from(original);
        changed[0] ^= 1;
        for (const [kind, tampered] of [
          ["content", changed],
          ["whitespace", Buffer.concat([original, Buffer.from(" ")])],
          ["BOM", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), original])],
          ["bare CR", Buffer.concat([original, Buffer.from("\r")])],
        ]) {
          writeFileSync(target, tampered);
          assert.throws(() => assertPublishedContent(sandbox),
            error => error.code === "ERR_ASSERTION" && error.expected === published[file],
            `${file}: ${kind} tampering must fail with ${JSON.stringify(ending)} endings`);
        }
        writeFileSync(target, original);
      }
      assertPublishedContent(sandbox);
    }
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("journal covers source SQL in order and every snapshot has a unique resolving identity", () => {
  const journal = json(path.join(meta, "_journal.json"));
  assert.equal(journal.dialect, "sqlite");
  assert.deepEqual(journal.entries.map(entry => `${entry.tag}.sql`), sqlFiles(migrations));
  assert.deepEqual(readdirSync(meta).filter(name => name.endsWith("_snapshot.json")).sort(),
    journal.entries.map(entry => `${entry.idx.toString().padStart(4, "0")}_snapshot.json`));
  let previous = "00000000-0000-0000-0000-000000000000";
  const ids = new Set([previous]);
  for (const [idx, entry] of journal.entries.entries()) {
    assert.equal(entry.idx, idx);
    assert.equal(Number(entry.tag.slice(0, 4)), idx);
    assert.ok(Number.isSafeInteger(entry.when));
    if (idx) assert.ok(entry.when > journal.entries[idx - 1].when, "strictly increasing generation timestamps");
    const current = snapshot(idx);
    assert.equal(current.dialect, "sqlite");
    assert.equal(current.version, entry.version);
    assert.equal(current.prevId, previous);
    assert.match(current.id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
    assert.ok(!ids.has(current.id), "noncolliding snapshot identity");
    ids.add(current.id);
    previous = current.id;
  }
});

test("0008 is the consent state and 0009 adds only the three intake columns and two checks", () => {
  const before = snapshot(8);
  const after = snapshot(9);
  const expected = structuredClone(after);
  delete expected.tables.engagement_log.columns.draft_updated_at;
  for (const column of ["purge_attempts", "purge_inflight"]) {
    delete expected.tables.proof_file.columns[column];
    delete expected.tables.proof_file.checkConstraints[`proof_file_${column}_check`];
  }
  assert.deepEqual(representation(before), representation(expected));
  assert.ok(before.tables.engagement_consent);
  assert.deepEqual(before.tables.engagement.indexes.engagement_freelancer_created_idx.columns, ["freelancer_id", "created_at"]);
  assert.equal(Object.keys(before.tables.engagement_consent.foreignKeys).length, 2);
  assert.equal(before.tables.engagement_consent.indexes.engagement_consent_policy_acceptance_id_unique.isUnique, true);
  assert.equal(after.tables.engagement_log.columns.draft_updated_at.type, "text");
  for (const column of ["purge_attempts", "purge_inflight"]) {
    assert.equal(after.tables.proof_file.columns[column].notNull, true);
    assert.equal(after.tables.proof_file.columns[column].default, 0);
    assert.ok(after.tables.proof_file.checkConstraints[`proof_file_${column}_check`]);
  }
});

test("latest snapshot matches every supported generated property and yields empty SQL", async () => {
  const journal = json(path.join(meta, "_journal.json"));
  const latest = snapshot(journal.entries.at(-1).idx);
  const current = await generateSQLiteDrizzleJson(loadSchema(), latest.id);
  assert.deepEqual(representation(latest), representation(current));
  assert.deepEqual(await generateSQLiteMigration(latest, current), []);
});

test("the audited 0007 baseline detects duplicate consent/intake DDL", async () => {
  const baseline = snapshot(7);
  const current = await generateSQLiteDrizzleJson(loadSchema(), baseline.id);
  const diff = await generateSQLiteMigration(baseline, current);
  assert.ok(diff.some(sql => sql.includes("CREATE TABLE `engagement_consent`")));
  assert.ok(diff.some(sql => sql.includes("ADD `draft_updated_at`")));
  assert.ok(diff.some(sql => sql.includes("__new_proof_file")));
  assert.throws(() => assert.deepEqual(diff, []), "empty-diff guard must reject the audited baseline");
});

test("real generator emits nothing unchanged and only the intended next numbered migration", { timeout: 90_000 }, () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "flag-migration-metadata-"));
  const out = path.join(sandbox, "drizzle");
  const require = createRequire(import.meta.url);
  const cli = path.join(path.dirname(require.resolve("drizzle-kit/api")), "bin.cjs");
  const generate = schema => {
    const result = spawnSync(process.execPath, [cli, "generate", "--dialect", "sqlite", "--schema", schema.replaceAll("\\", "/"),
      "--out", "./drizzle", "--name", "metadata_probe"], { cwd: sandbox, encoding: "utf8", timeout: 60_000, windowsHide: true });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return `${result.stdout}\n${result.stderr}`;
  };
  try {
    cpSync(migrations, out, { recursive: true });
    // No-mutation evidence must hash raw bytes, without checkout normalization.
    const inventory = () => Object.fromEntries([
      ...sqlFiles(out).map(file => [file, hash(path.join(out, file))]),
      ...readdirSync(path.join(out, "meta")).map(file => [`meta/${file}`, hash(path.join(out, "meta", file))]),
    ]);
    const original = inventory();
    assert.match(generate(schemaPath), /No schema changes/);
    assert.deepEqual(inventory(), original);

    const probe = path.join(sandbox, "schema.ts");
    const source = readFileSync(schemaPath, "utf8");
    const marker = '    name: text("name").notNull(),';
    assert.equal(source.split(marker).length, 2);
    // Absolute installed imports let this disposable schema resolve the exact
    // project dependencies without copying/installing node_modules or secrets.
    writeFileSync(probe, source.replace(marker, `${marker}\n    metadataProbe: text("metadata_probe"),`)
      .replace('from "drizzle-orm"', `from ${JSON.stringify(require.resolve("drizzle-orm"))}`)
      .replace('from "drizzle-orm/sqlite-core"', `from ${JSON.stringify(require.resolve("drizzle-orm/sqlite-core"))}`));
    generate(probe);
    const next = sqlFiles(out).filter(file => !(file in original));
    const journal = json(path.join(out, "meta", "_journal.json"));
    const previous = json(path.join(meta, "_journal.json"));
    const nextIndex = previous.entries.at(-1).idx + 1;
    assert.deepEqual(next, [`${nextIndex.toString().padStart(4, "0")}_metadata_probe.sql`]);
    assert.equal(readFileSync(path.join(out, next[0]), "utf8").trim(), 'ALTER TABLE `user` ADD `metadata_probe` text;');
    assert.deepEqual(journal.entries.slice(0, -1), previous.entries);
    assert.equal(journal.entries.at(-1).idx, nextIndex);
    const generated = json(path.join(out, "meta", `${nextIndex.toString().padStart(4, "0")}_snapshot.json`));
    assert.equal(generated.prevId, snapshot(nextIndex - 1).id);
    assert.ok(!previous.entries.some(entry => snapshot(entry.idx).id === generated.id));
    for (const [file, digest] of Object.entries(original)) {
      if (file !== "meta/_journal.json") assert.equal(hash(path.join(out, file)), digest, file);
    }
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
