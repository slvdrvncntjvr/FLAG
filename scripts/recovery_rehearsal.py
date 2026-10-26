"""Synthetic, offline migration/SQL-backup rehearsal; never opens an existing DB.

Run from any directory: python scripts/recovery_rehearsal.py
Only durable output: temporary/recovery-rehearsal-report.md (synthetic evidence).
All databases/exports live in a fresh OS temp directory and are removed on exit.
This is native SQLite evidence, NOT a Wrangler/D1/Time Travel restore drill.
"""

import argparse
from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import stat
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = (
    "0000_init.sql", "0001_triggers.sql", "0002_pink_colossus.sql",
    "0003_melted_the_twelve.sql", "0004_clever_arclight.sql", "0005_happy_vermin.sql",
)
# Hash normalized newlines so a normal Git CRLF checkout stays reproducible.
# Any SQL change requires a new review, not silently discovering a new migration.
REVIEWED_SHA256 = (
    "ccbdf47104ecfd84d00700970e1ec56d9aa2df7e79871eb47a6861e933656322",
    "4406970708512ce3826be721170d48a3cfdd2c10ff0827e2a9552447fcf48297",
    "5e71d71c09cef9d040fd4fa014c061a976f31b632bf8b84037a21bf2e97fb4a4",
    "5a3d4e85b0591df91f4aafb18c3b7699dfeb6824ee46719d2f27d57cd383c5d2",
    "12177289b6a018330cbe0ee934ac0a717ad1f54271e57b775c9d88f67a296e24",
    "81cce6b4286b1e57133a999e87c5d24fb99a8bb12f3ce67317020651e84d8019",
)
STAMP = "2026-10-01T00:00:00.000Z"


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def load_migrations():
    scripts = [(ROOT / "web" / "drizzle" / name).read_text(encoding="utf-8")
               for name in MIGRATIONS]
    for name, sql, expected in zip(MIGRATIONS, scripts, REVIEWED_SHA256):
        require(digest(sql.encode()) == expected, f"SQL changed; review required: {name}")
    return scripts


class Sandbox:
    """Owns freshly allocated paths only; no user-supplied database paths."""

    def __init__(self, directory):
        self.directory = Path(directory).resolve()

    def fresh_path(self, name):
        require(Path(name).name == name and name not in ("", ".", ".."), "Unsafe name")
        target = self.directory / name
        # x mode refuses even symlinks and existing empty databases.
        with target.open("xb"):
            pass
        return target

    def database(self, name):
        path = self.fresh_path(name)
        db = sqlite3.connect(path, isolation_level=None)
        db.execute("PRAGMA foreign_keys=ON")
        return db, path


def ident(name):
    return '"' + name.replace('"', '""') + '"'


def snapshot(db):
    schema = db.execute(
        "SELECT type,name,tbl_name,sql FROM sqlite_schema "
        "WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"
    ).fetchall()
    tables = [row[1] for row in schema if row[0] == "table"]
    data = {}
    for table in tables:
        rows = db.execute(f"SELECT * FROM {ident(table)}").fetchall()
        data[table] = sorted(rows, key=lambda row: json.dumps(row, ensure_ascii=True))
    return {"schema": schema, "data": data}


def snapshot_hash(snap):
    return digest(json.dumps(snap, sort_keys=True, ensure_ascii=True).encode())


def healthy(db):
    require(db.execute("PRAGMA foreign_keys").fetchone() == (1,), "FKs disabled")
    require(db.execute("PRAGMA foreign_key_check").fetchall() == [], "FK violations")
    require(db.execute("PRAGMA integrity_check").fetchall() == [("ok",)], "Integrity failed")


def preserved(before, after, rebuilt=False):
    for table, rows in before["data"].items():
        require(after["data"].get(table) == rows, f"Rows changed in {table}")
    previous = {(r[0], r[1]): r for r in before["schema"]}
    current = {(r[0], r[1]): r for r in after["schema"]}
    for key, row in previous.items():
        if rebuilt and key == ("table", "engagement_log"):
            # The rename normalizes identifier quotes and rewrites CHECK table
            # qualifiers. All original columns, CHECKs and FKs must still exist,
            # in order; the only permitted addition is the parties FK line.
            def declarations(sql):
                sql = sql.replace("__new_engagement_log", "engagement_log").replace("`", '"')
                return [line.strip().rstrip(",") for line in sql.splitlines() if line.strip()]

            original = declarations(row[3])
            updated = declarations(current[key][3])
            added = ('FOREIGN KEY ("engagement_id","freelancer_id","client_id") '
                     'REFERENCES "engagement"("id","freelancer_id","client_id") '
                     'ON UPDATE no action ON DELETE restrict')
            require(updated.count(added) == 1, "Unexpected parties FK declaration")
            require([line for line in updated if line != added] == original,
                    "Rebuild changed existing columns, CHECKs or FKs")
            continue
        require(current.get(key) == row, f"Schema object changed: {key}")


def insert(db, table, **values):
    db.execute(f"INSERT INTO {ident(table)} ({','.join(map(ident, values))}) "
               f"VALUES ({','.join('?' for _ in values)})", tuple(values.values()))


def seed_pre0003(db):
    for user, role in (("freelancer", "freelancer"), ("client", "client"),
                       ("client2", "client"), ("moderator", "moderator"), ("new", None)):
        insert(db, "user", id=user, name=f"Synthetic {user}", email=f"{user}@example.invalid",
               role=role, email_verified=1, created_at=STAMP, updated_at=STAMP)
        insert(db, "account", id=f"account-{user}", user_id=user, provider_id="credential",
               account_id=user, created_at=STAMP, updated_at=STAMP)
        insert(db, "session", id=f"session-{user}", user_id=user, token=f"fake-session-{user}",
               expires_at="2026-12-01T00:00:00Z", created_at=STAMP, updated_at=STAMP)
        if role:
            for policy in ("privacy", "terms") + (("freelancer_ack",) if role == "freelancer" else ()):
                insert(db, "policy_acceptance", id=f"{user}-{policy}", user_id=user,
                       policy=policy, version="2026-10-14", accepted_at=STAMP)
    insert(db, "auth_verification", id="fake-verification", identifier="fake@example.invalid",
           value="synthetic-not-a-real-code-hash", expires_at="2026-12-01T00:00:00Z",
           created_at=STAMP, updated_at=STAMP)
    insert(db, "freelancer_profile", user_id="freelancer", display_name="Synthetic Freelancer",
           city="Synthetic City", status="verified", verified_at=STAMP, created_at=STAMP)
    insert(db, "portfolio_link", id="portfolio", freelancer_id="freelancer",
           url="https://example.invalid/synthetic", label="Synthetic portfolio")
    insert(db, "verification_case", id="inspection", freelancer_id="freelancer",
           reviewer_id="moderator", id_kind="passport", result="pass", name_match=1,
           inspected_at=STAMP, decision="approve", reason="Synthetic inspection only",
           decided_at=STAMP, created_at=STAMP)
    for client in ("client", "client2"):
        insert(db, "client_profile", id=f"profile-{client}", user_id=client,
               display_name=f"Synthetic {client}", kind="individual", created_at=STAMP)
    for number, status in enumerate(("accepted", "accepted", "invited", "declined", "expired", "cancelled")):
        insert(db, "engagement", id=f"engagement-{number}", freelancer_id="freelancer",
               client_id="profile-client" if status == "accepted" else None,
               title=f"Synthetic work {number}", client_name_hint="Synthetic client",
               started_on="2026-09-01", ended_at="2026-10-01" if status == "accepted" else None,
               status=status, invite_token_hash=f"fake-invite-{number}",
               invite_expires_at="2026-10-15T00:00:00Z",
               accepted_at=STAMP if status == "accepted" else None,
               declined_at=STAMP if status == "declined" else None, created_at=STAMP)


def seed_pre0005(db):
    # Both directions of the log/revision relationship, proof metadata and tags
    # exist before the rebuild. No proof bytes/R2 objects are created.
    for n in range(2):
        insert(db, "engagement_log", id=f"log-{n}", ref=f"SYNTHETIC-{n}",
               engagement_id=f"engagement-{n}", freelancer_id="freelancer",
               client_id="profile-client", anchor_kind="completed", anchor_date="2026-10-01",
               first_submitted_at=STAMP, submitted_at=STAMP, created_at=STAMP)
        insert(db, "log_revision", id=f"revision-{n}", log_id=f"log-{n}", rev_no=1,
               kind="initial", rating=5 if n == 0 else 1, outcome="positive" if n == 0 else "negative",
               facts="Entirely synthetic rehearsal facts; no real person or work is represented.",
               period_start="2026-09-01", period_end="2026-10-01", amount_centavos=12345,
               submitted_by="freelancer", submitted_at=STAMP, decided_by="moderator",
               decided_at=STAMP, decision="approve", reason="Synthetic decision only")
        insert(db, "log_tag", revision_id=f"revision-{n}", tag="Professional" if n == 0 else "Non-Payment")
        insert(db, "proof_file", id=f"proof-{n}", log_id=f"log-{n}", revision_id=f"revision-{n}",
               owner_kind="filer", uploaded_by="freelancer", object_key=f"synthetic/proof-{n}",
               kind="invoice", mime="application/pdf", size_bytes=128, sha256="0" * 64,
               status="attached", uploaded_at=STAMP)
        db.execute("UPDATE engagement_log SET current_revision_id=?,status='published',"
                   "published_at=?,expires_at=?,hold_kind='review',hold_placed_at=? WHERE id=?",
                   (f"revision-{n}", STAMP, "2027-10-01T00:00:00Z", STAMP, f"log-{n}"))


def rejection(db, sql, expected):
    before = snapshot(db)
    db.execute("SAVEPOINT negative_probe")
    try:
        try:
            db.execute(sql)
        except sqlite3.IntegrityError as error:
            require(expected.lower() in str(error).lower(), f"Wrong rejection: {error}")
        else:
            raise RuntimeError(f"Constraint did not reject: {sql}")
    finally:
        db.execute("ROLLBACK TO negative_probe")
        db.execute("RELEASE negative_probe")
    require(snapshot(db) == before, "Negative probe mutated data")


def constraint_probes(db):
    cases = (
        ("UPDATE policy_acceptance SET version='bad' WHERE id='client-terms'", "append-only"),
        ("DELETE FROM policy_acceptance WHERE id='client-terms'", "append-only"),
        ("UPDATE user SET role='unknown' WHERE id='new'", "CHECK"),
        ("UPDATE user SET email='client@example.invalid' WHERE id='new'", "UNIQUE"),
        ("UPDATE auth_rate_limit SET count=0", "CHECK"),
        ("UPDATE engagement_log SET client_id='profile-client2' WHERE id='log-0'", "FOREIGN KEY"),
        ("UPDATE engagement_log SET current_revision_id='revision-1' WHERE id='log-0'", "FOREIGN KEY"),
        ("UPDATE proof_file SET revision_id='revision-1' WHERE id='proof-0'", "FOREIGN KEY"),
        ("UPDATE log_revision SET rating=6 WHERE id='revision-0'", "CHECK"),
        ("UPDATE log_revision SET rating=1 WHERE id='revision-0'", "CHECK"),
        ("UPDATE log_revision SET period_end='2026-02-30' WHERE id='revision-0'", "CHECK"),
        ("UPDATE proof_file SET size_bytes=10485761 WHERE id='proof-0'", "CHECK"),
        ("UPDATE engagement_log SET ref='SYNTHETIC-1' WHERE id='log-0'", "UNIQUE"),
        ("DELETE FROM engagement WHERE id='engagement-0'", "FOREIGN KEY"),
    )
    for sql, expected in cases:
        rejection(db, sql, expected)
    healthy(db)
    return len(cases)


def assert_parties_fk(db):
    groups = {}
    for row in db.execute("PRAGMA foreign_key_list(engagement_log)"):
        groups.setdefault(row[0], []).append(row)
    require(any([(r[2], r[3], r[4], r[6]) for r in sorted(rows, key=lambda r: r[1])] == [
        ("engagement", "engagement_id", "id", "RESTRICT"),
        ("engagement", "freelancer_id", "freelancer_id", "RESTRICT"),
        ("engagement", "client_id", "client_id", "RESTRICT"),
    ] for rows in groups.values()), "Composite parties FK missing")


def export_restore(db, sandbox, label):
    expected = snapshot(db)
    sql = "\n".join(db.iterdump()) + "\n"
    export = sandbox.fresh_path(f"{label}.sql")
    export.write_text(sql, encoding="utf-8", newline="\n")
    restored, path = sandbox.database(f"{label}-restored.sqlite3")
    with closing(restored):
        # Native SQLite import needs FK OFF for dependency/circular ordering.
        # Restore is accepted only after re-enabling and checking every FK.
        restored.execute("PRAGMA foreign_keys=OFF")
        restored.executescript(export.read_text(encoding="utf-8"))
        restored.execute("PRAGMA foreign_keys=ON")
        healthy(restored)
        require(snapshot(restored) == expected, f"{label} SQL restoration differs")
        probes = 0
        if label == "post0005":
            assert_parties_fk(restored)
            probes = constraint_probes(restored)
        return {"sql_sha256": digest(export.read_bytes()), "sql_bytes": export.stat().st_size,
                "restored_snapshot_sha256": snapshot_hash(snapshot(restored)),
                "restored_database_sha256": digest(path.read_bytes()), "constraint_probes": probes}


def migration_snapshot(db, sandbox, label):
    state = snapshot(db)
    target, path = sandbox.database(f"{label}-snapshot.sqlite3")
    with closing(target):
        db.backup(target)
        healthy(target)
        require(snapshot(target) == state, "Binary snapshot differs")
    return {"snapshot_sha256": snapshot_hash(state), "database_sha256": digest(path.read_bytes()),
            "rows": {table: len(rows) for table, rows in state["data"].items()},
            "schema_objects": len(state["schema"])}


def transaction_probe(db, sql):
    """Conservative SQLite probe of D1's always-on FK transaction boundary.

    No executescript here: it would implicitly COMMIT before the experiment.
    This is NOT a D1 emulator and never substitutes SQL into the real migration.
    """
    with closing(sqlite3.connect(":memory:", isolation_level=None)) as probe:
        db.backup(probe)
        probe.execute("PRAGMA foreign_keys=ON")
        original = snapshot(probe)
        probe.execute("BEGIN")
        statement = ""
        try:
            for line in sql.splitlines(keepends=True):
                statement += line
                if sqlite3.complete_statement(statement):
                    probe.execute(statement)
                    statement = ""
            probe.execute("COMMIT")
        except sqlite3.DatabaseError as error:
            probe.execute("ROLLBACK")
            require(snapshot(probe) == original, "Compatibility rollback changed data")
            return {"result": "blocked", "error": str(error), "rollback_preserved": True}
        return {"result": "passed", "rollback_preserved": None}


def rehearse(scripts):
    try:
        revision = subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD"],
                                           text=True, stderr=subprocess.DEVNULL).strip()
    except (OSError, subprocess.CalledProcessError):
        revision = "unavailable (not a Git checkout)"
    evidence = {"utc": datetime.now(timezone.utc).isoformat(),
                "python": sys.version.split()[0], "sqlite": sqlite3.sqlite_version,
                "source_revision": revision, "script_sha256": digest(Path(__file__).read_bytes()),
                "migration_sha256": dict(zip(MIGRATIONS, REVIEWED_SHA256))}
    with tempfile.TemporaryDirectory(prefix="flag-recovery-rehearsal-") as directory:
        sandbox = Sandbox(directory)
        db, _ = sandbox.database("synthetic.sqlite3")
        with closing(db):
            for sql in scripts[:3]:
                db.executescript(sql)
            seed_pre0003(db)
            healthy(db)
            baseline = snapshot(db)
            evidence["pre0003"] = migration_snapshot(db, sandbox, "pre0003")
            evidence["pre0003_restore"] = export_restore(db, sandbox, "pre0003")
            db.executescript(scripts[3])
            preserved(baseline, snapshot(db))
            insert(db, "auth_rate_limit", key="synthetic-hmac-bucket", count=3, expires_at=1790812800000)
            healthy(db)
            evidence["post0003"] = migration_snapshot(db, sandbox, "post0003")
            before = snapshot(db)
            db.executescript(scripts[4])
            preserved(before, snapshot(db))
            seed_pre0005(db)
            healthy(db)
            evidence["pre0005"] = migration_snapshot(db, sandbox, "pre0005")
            evidence["d1_transaction_compatibility_probe"] = transaction_probe(db, scripts[5])
            before = snapshot(db)
            db.executescript(scripts[5])
            preserved(before, snapshot(db), rebuilt=True)
            healthy(db)
            assert_parties_fk(db)
            evidence["constraint_probes"] = constraint_probes(db)
            evidence["post0005"] = migration_snapshot(db, sandbox, "post0005")
            evidence["post0005_restore"] = export_restore(db, sandbox, "post0005")
    require(not Path(directory).exists(), "Owned temp directory not cleaned")
    evidence["cleanup"] = "PASS: all owned SQLite databases, snapshots and SQL exports removed"
    evidence["validation"] = {"foreign_keys": 1, "foreign_key_check": [],
                              "integrity_check": "ok", "exact_restore_comparison": True}
    return evidence


def report_text(evidence):
    return """# FLAG isolated recovery rehearsal

Result: PASS (native SQLite migration/data/SQL restoration checks only).
Reproduce from repository root: `python scripts/recovery_rehearsal.py`.
Safety tests: `python -m unittest discover -s scripts -p test_recovery_rehearsal.py -v`.

All fixture values are synthetic (reserved example.invalid addresses and fake tokens).
Pre0003 includes accounts, sessions, a not-yet-onboarded user, versioned onboarding
receipts, profiles, portfolio, completed inspection metadata without ID numbers or
images, and six engagements spanning all five states. Before 0005, two logs with
opposite ratings, revisions, current-revision pointers, tags and proof metadata
exercise the populated rebuild. No real proof files or R2 objects are accessed.

Reviewed SQL: 0000 creates auth/onboarding tables; 0001 adds append-only receipt
triggers; 0002 creates profile/inspection/engagement tables; 0003 adds only auth
rate limits; 0004 adds four log/proof tables and ownership/check/unique constraints;
0005 adds the engagement parties unique index and rebuilds engagement_log through
copy/drop/rename to add the parties FK, then recreates all three log indexes.
Existing row values are compared exactly across migrations; pre-existing schema
declarations/indexes/triggers are compared except the intentional rebuilt table.
Binary snapshots are independently compared, and SQL exports at both pre0003
and post0005 are imported into distinct fresh databases with exact schema/data
comparison, integrity_check=ok and empty foreign_key_check. Fourteen constraint
rejections run on migrated and restored final databases without changing rows.

The reported snapshots/exports are verified transient artifacts. Only their
hashes, counts and this report remain after safe cleanup; no backup is retained.
The command accepts no target path, connection string, environment or remote flag,
uses no Wrangler, credentials or network, and never opens existing developer DBs.

Remote readiness remains HELD. Native SQLite autocommit honors foreign_keys=OFF
in 0005; D1 always enforces foreign keys inside implicit transactions and instead
supports defer_foreign_keys. The populated transaction probe below is a limited
SQLite compatibility check, not D1 execution; a blocked result means native PASS
cannot establish populated D1 migration safety. It does not alter migration SQL.
See [Cloudflare foreign-key rules](https://developers.cloudflare.com/d1/sql-api/foreign-keys/)
and [migration guidance](https://developers.cloudflare.com/d1/reference/migrations/).

SQLite iterdump/executescript with temporary FK disabling is not Wrangler export/
import, Cloudflare backup encryption, a Time Travel bookmark/restore, Worker
rollback, concurrent-write recovery, R2 restoration, or a production data test.
The D1 migration ledger and workerd runtime are not modeled; hashes identify the
exact SQL reviewed, rather than claiming remote migration-history verification.
See [Cloudflare import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
and [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).
No production data was exported and no remote resources were created or changed.

Remaining owner gates: select the encrypted backup destination/access and a
write-pause/data-loss window; authorize a real explicitly isolated Cloudflare
export/import and Time Travel recovery drill, including the populated 0005
transaction boundary, resource identities, restored schema/data/FKs and cleanup.
Production migrations, restore, promotion and spend stay held for explicit owner
authorization; this local command does not clear OPS production readiness gates.

Evidence (observed, not inferred):

```json
""" + json.dumps(evidence, indent=2, sort_keys=True) + "\n```\n"


def write_report(evidence):
    directory = ROOT / "temporary"
    target = directory / "recovery-rehearsal-report.md"
    # Reject POSIX symlinks and Windows junctions/reparse points before writing.
    for path in (directory, target):
        if path.exists() or path.is_symlink():
            info = path.lstat()
            require(not stat.S_ISLNK(info.st_mode) and not
                    (getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT),
                    f"Refusing redirected report path: {path}")
    directory.mkdir(exist_ok=True)
    require(directory.resolve() == ROOT / "temporary", "Report directory escaped repo")
    # Replace only the named report; never follow an existing report hardlink.
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n",
                                     dir=directory, prefix="recovery-report-", delete=False) as out:
        staging = Path(out.name)
        try:
            out.write(report_text(evidence))
        except BaseException:
            out.close()
            staging.unlink()
            raise
    try:
        staging.replace(target)
    finally:
        staging.unlink(missing_ok=True)
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()  # No database/report/remote path override by design.
    try:
        evidence = rehearse(load_migrations())
        path = write_report(evidence)
    except (OSError, sqlite3.Error, RuntimeError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(f"PASS: native migrations 0003-0005; {evidence['constraint_probes']} constraints "
          f"on source and restored DB; pre/post export-import; cleanup verified\nReport: {path}")
    print("Remote readiness HELD; populated D1 transaction compatibility probe: "
          + evidence["d1_transaction_compatibility_probe"]["result"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
