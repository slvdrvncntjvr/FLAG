"""Rehearse published production migrations with real, strictly local Wrangler D1.

Run from any directory: python scripts/production_migration_rehearsal.py
Requires the existing web/node_modules and exactly Node 24.22.1. No install,
remote target, credentials, developer DB, .dev.vars or repo Wrangler config.
Only synthetic counts, hashes, commands and verdicts survive OS-temp cleanup.
This is local SQL compatibility/recovery evidence, not a remote restore drill.
"""

import argparse
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "web/node_modules/wrangler/bin/wrangler.js"
MIGRATIONS = (
    "0000_init.sql", "0001_triggers.sql", "0002_pink_colossus.sql",
    "0003_melted_the_twelve.sql", "0004_clever_arclight.sql",
    "0005_happy_vermin.sql", "0006_verification_review.sql",
    "0007_verification_submitted_profile.sql",
)
AUTH = {"user", "account", "session", "auth_verification", "policy_acceptance"}
STAMP = "2026-10-01T00:00:00.000Z"
LATER = "2027-10-01T00:00:00.000Z"
TRIGGERS = {
    "policy_acceptance_no_update", "policy_acceptance_no_delete",
    "verification_case_frozen_update", "verification_case_frozen_delete",
    "moderation_case_frozen_update", "moderation_case_frozen_delete",
    "audit_event_no_update", "audit_event_no_delete",
    "verification_owner_name_frozen", "verification_profile_name_frozen",
    "verification_portfolio_frozen_insert", "verification_portfolio_frozen_update",
    "verification_portfolio_frozen_delete", "verification_submitted_profile_frozen",
}
# Historical raw hashes from the original Windows rehearsal; retain its receipt binding.
REVIEWED_SHA256 = (
    "c01ae6ee3252711aadcc27a546c329c49a7925155fd1c792cf0ff6e7960a2c7d",
    "e3dc23f66aaa022c5ff0317abd877469ed6d69573722b3b65c3268b2d3d7ae1a",
    "0b049a1233d1f6ca4dc03ee2fabbb0ca88e6d0bae4dca968c4fde39f8a2ce020",
    "5a3d4e85b0591df91f4aafb18c3b7699dfeb6824ee46719d2f27d57cd383c5d2",
    "8ae7dc16f749b172aeca5777aee6caeb6ad22165c608f48cc670973302de3d49",
    "e92c4142f30c671c2359619f04ed9537f0b28ba5915566701358ee2287e8ef92",
    "0f645218e0d946673975b2f2704149b0ea4c49676c0bd4dc77e9cae277773c70",
    "86d00f812e22f4a92ac8d8db852b652353a38581ccf94811e82f642639fc11b1",
)
# Independently derived from exact Git blobs at 82057ecdaace93c83ea297b9c780593807134f1e:
# canonical LF bytes and complete LF-to-CRLF checkout bytes, including quoted text.
# Only these exact per-file hashes are accepted. Never normalize input for validation
# or execution: every accepted file is copied byte-for-byte into the owned rehearsal.
REVIEWED_CHECKOUT_SHA256 = {
    "0000_init.sql": (
        "ccbdf47104ecfd84d00700970e1ec56d9aa2df7e79871eb47a6861e933656322",
        "c01ae6ee3252711aadcc27a546c329c49a7925155fd1c792cf0ff6e7960a2c7d",
    ),
    "0001_triggers.sql": (
        "4406970708512ce3826be721170d48a3cfdd2c10ff0827e2a9552447fcf48297",
        "e3dc23f66aaa022c5ff0317abd877469ed6d69573722b3b65c3268b2d3d7ae1a",
    ),
    "0002_pink_colossus.sql": (
        "5e71d71c09cef9d040fd4fa014c061a976f31b632bf8b84037a21bf2e97fb4a4",
        "0b049a1233d1f6ca4dc03ee2fabbb0ca88e6d0bae4dca968c4fde39f8a2ce020",
    ),
    "0003_melted_the_twelve.sql": (
        "5a3d4e85b0591df91f4aafb18c3b7699dfeb6824ee46719d2f27d57cd383c5d2",
        "6a5e37cd456a028101446ffd10074d329d466532bb48064a3af1dc2d1459be2d",
    ),
    "0004_clever_arclight.sql": (
        "12177289b6a018330cbe0ee934ac0a717ad1f54271e57b775c9d88f67a296e24",
        "8ae7dc16f749b172aeca5777aee6caeb6ad22165c608f48cc670973302de3d49",
    ),
    "0005_happy_vermin.sql": (
        "81cce6b4286b1e57133a999e87c5d24fb99a8bb12f3ce67317020651e84d8019",
        "e92c4142f30c671c2359619f04ed9537f0b28ba5915566701358ee2287e8ef92",
    ),
    "0006_verification_review.sql": (
        "3c34a504f38ee8996fe324ad97f191f18122dcbde19deadf42a0faa3eacc93d7",
        "0f645218e0d946673975b2f2704149b0ea4c49676c0bd4dc77e9cae277773c70",
    ),
    "0007_verification_submitted_profile.sql": (
        "66be5b23abaa2278b9fab52675da8f4608001fb2cff2ba8dd69e7ba9e433a55d",
        "86d00f812e22f4a92ac8d8db852b652353a38581ccf94811e82f642639fc11b1",
    ),
}


def require(value, message):
    if not value:
        raise RuntimeError(message)


def digest(value):
    if not isinstance(value, bytes):
        value = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(value).hexdigest()


def quote(value):
    if value is None:
        return "NULL"
    if isinstance(value, int):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


def insert(table, **values):
    return (f"INSERT INTO {identifier(table)} (" + ",".join(map(identifier, values))
            + ") VALUES (" + ",".join(map(quote, values.values())) + ");")


def export_statements(sql):
    """Parse statements without interpreting, executing or rewriting their SQL."""
    statements, pending = [], ""
    for character in sql:
        pending += character
        if character == ";" and sqlite3.complete_statement(pending):
            statements.append(pending.strip())
            pending = ""
    require(not pending.strip(), "Incomplete SQL export statement")
    require(statements, "Empty SQL export")
    return statements


def order_export(sql):
    """Keep every statement/value exactly; make all parent tables exist first.

    This repairs exporter ordering, never migration SQL. sqlite3 is used only
    as a statement-boundary parser; execution/foreign keys remain real D1.
    """
    statements = export_statements(sql)

    def priority(statement):
        if re.fullmatch(r"PRAGMA\s+defer_foreign_keys\s*=\s*(?:TRUE|ON|1)\s*;", statement, re.I):
            return 0
        if re.match(r"CREATE\s+TABLE\s", statement, re.I):
            return 1
        if re.match(r"CREATE\s+(?:UNIQUE\s+)?INDEX\s", statement, re.I):
            return 2
        if re.fullmatch(r"DELETE\s+FROM\s+sqlite_sequence\s*;", statement, re.I):
            return 3
        if re.match(r"INSERT\s+INTO\s", statement, re.I):
            return 4
        if re.match(r"CREATE\s+TRIGGER\s", statement, re.I):
            return 5
        raise RuntimeError("Unsupported statement in owned SQL export")

    ordered = sorted(statements, key=priority)  # Stable within each category.
    require(any(priority(s) == 0 for s in ordered), "Export lacks D1 deferred-FK pragma")
    output = "\n".join(ordered) + "\n"
    require(Counter(export_statements(output)) == Counter(statements), "SQL statement multiset changed")
    return output, {"statement_count": len(statements), "exact_statement_multiset": True,
                    "statement_multiset_sha256": digest(sorted(statements))}


def isolated_environment(directory):
    # Construct from a small platform allowlist: never inherit provider tokens,
    # NODE_OPTIONS, proxy credentials, Wrangler/account/CI selections or dotenv.
    allowed = {"path", "systemroot", "windir", "comspec", "pathext",
               "programdata", "programfiles", "programfiles(x86)",
               "number_of_processors"}
    env = {key: value for key, value in os.environ.items() if key.lower() in allowed}
    for key in ("HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME",
                "XDG_CACHE_HOME", "XDG_DATA_HOME", "TEMP", "TMP", "TMPDIR"):
        env[key] = str(directory)
    env.update(CI="true", NO_COLOR="1", WRANGLER_SEND_METRICS="false",
               CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV="false",
               WRANGLER_LOG_PATH=str(directory / "wrangler.log"),
               # Fail closed for accidental non-loopback HTTP in the CLI.
               HTTP_PROXY="http://127.0.0.1:9", HTTPS_PROXY="http://127.0.0.1:9",
               ALL_PROXY="http://127.0.0.1:9", NO_PROXY="localhost,127.0.0.1,::1")
    return env


@contextmanager
def owned_temporary(evidence):
    directory = None
    try:
        with tempfile.TemporaryDirectory(prefix="flag-production-rehearsal-") as directory:
            yield directory
    finally:
        if directory is not None:
            require(not Path(directory).exists(), "Owned temporary directory survived cleanup")
            evidence["cleanup"] = "PASS: all owned configs, credential homes, logs, SQL, exports and D1 states removed"


class LocalD1:
    def __init__(self, directory, node, evidence):
        self.root = Path(directory).resolve()
        self.node = node
        self.env = isolated_environment(self.root)
        self.evidence = evidence
        self.number = 0

    def run(self, args, expected_error=None, cli=True):
        argv = [self.node, str(CLI), *map(str, args)] if cli else list(map(str, args))
        started = time.monotonic()
        process = subprocess.Popen(argv, cwd=self.root, env=self.env,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   text=True, encoding="utf-8", errors="replace",
                                   creationflags=(subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0),
                                   start_new_session=os.name != "nt")
        try:
            out, err = process.communicate(timeout=120)
        except BaseException:
            # A timed-out/interrupted workerd must not outlive owned temp state.
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                               env=self.env, capture_output=True, timeout=15,
                               creationflags=subprocess.CREATE_NO_WINDOW, check=False)
            else:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            process.communicate(timeout=15)
            raise
        display = [str(part).replace(str(self.root), "$TEMP").replace(str(ROOT), "$REPO")
                   for part in argv]
        self.evidence["commands"].append({"argv": display, "exit": process.returncode,
                                           "seconds": round(time.monotonic() - started, 2),
                                           "expected_error": expected_error})
        if expected_error:
            require(process.returncode != 0 and re.search(expected_error, out + err, re.I),
                    f"Expected local rejection {expected_error}: {out[-1600:]} {err[-1600:]}")
        else:
            require(process.returncode == 0,
                    f"Local command failed: {display}: {out[-2200:]} {err[-2200:]}")
        return out

    def config(self, label, migrations):
        folder = self.root / label
        folder.mkdir()
        config = folder / "wrangler.json"
        config.write_text(json.dumps({
            "name": "synthetic-production-rehearsal", "account_id": "0" * 32,
            "compatibility_date": "2026-10-01", "send_metrics": False,
            "d1_databases": [{"binding": "DB", "database_name": "synthetic-rehearsal",
                              "database_id": "00000000-0000-0000-0000-000000000001",
                              "migrations_dir": str(migrations), "remote": False}],
        }), encoding="utf-8")
        return config

    def command(self, config, *args, expected_error=None):
        # All D1 paths are created below our owned OS temp directory.
        require(config.resolve().is_relative_to(self.root), "Config escaped sandbox")
        # Export has no --persist-to in Wrangler 4.149.0. Its documented local
        # default is config.parent/.wrangler/state, so share that owned default
        # across every command, including export and restoration.
        return self.run(["d1", *args, "--local", "--config", config], expected_error)

    def sql(self, config, sql, expected_error=None):
        self.number += 1
        path = self.root / f"query-{self.number:04}.sql"
        path.write_text(sql, encoding="utf-8", newline="\n")
        output = self.command(config, "execute", "synthetic-rehearsal", "--file", path,
                              "--json", expected_error=expected_error)
        if expected_error:
            return None
        result = json.loads(output)
        require(all(item.get("success") for item in result), "D1 query did not succeed")
        return [item["results"] for item in result]

    def apply(self, config):
        return self.command(config, "migrations", "apply", "synthetic-rehearsal")

    def snapshot(self, config):
        schema = self.sql(config, "SELECT type,name,tbl_name,sql FROM sqlite_schema "
                          "WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' "
                          "ORDER BY type,name;")[0]
        tables = sorted(item["name"] for item in schema if item["type"] == "table")
        statements = ["PRAGMA foreign_keys;", "PRAGMA foreign_key_check;"]
        for table in tables:
            statements += [f"SELECT * FROM {identifier(table)};",
                           f"PRAGMA table_info({identifier(table)});",
                           f"PRAGMA foreign_key_list({identifier(table)});"]
        result = self.sql(config, "\n".join(statements))
        require(result[0] == [{"foreign_keys": 1}], "D1 foreign keys are not enabled")
        require(result[1] == [], "D1 foreign_key_check failed")
        return {"schema": schema,
                "data": {table: sorted(result[2 + i * 3], key=lambda r: json.dumps(r, sort_keys=True))
                         for i, table in enumerate(tables)},
                "columns": {table: result[3 + i * 3] for i, table in enumerate(tables)},
                "fks": {table: result[4 + i * 3] for i, table in enumerate(tables)}}


def seed(rich=True):
    sql = []
    users = [("freelancer", "freelancer"), ("client", "client"), ("new", None),
             ("moderator", "moderator"), ("admin", "admin"), ("banned", "client")]
    for name, role in users if rich else users[:1]:
        sql.append(insert("user", id=name, name=f"Synthetic {name}",
                          email=f"{name}@example.invalid", role=role, email_verified=1,
                          banned=int(name == "banned"),
                          ban_reason="Synthetic suspension" if name == "banned" else None,
                          created_at=STAMP, updated_at=STAMP))
    policies = [("freelancer", "privacy", "2026-10-12"),
                ("freelancer", "terms", "2026-10-12")]
    if rich:
        policies += [("freelancer", "freelancer_ack", "2026-10-12"),
                     ("freelancer", "privacy", "synthetic-previous-version"),
                     ("client", "privacy", "2026-10-12"), ("client", "terms", "2026-10-12"),
                     ("client", "client_consent", "2026-10-12")]
    for n, (user, policy, version) in enumerate(policies):
        sql.append(insert("policy_acceptance", id=f"receipt-{n}", user_id=user,
                          policy=policy, version=version, accepted_at=STAMP))
    if rich:
        for n, user in enumerate(("freelancer", "client", "new")):
            sql += [insert("account", id=f"account-{n}", user_id=user,
                           provider_id="credential", account_id=f"synthetic-account-{n}",
                           access_token=f"synthetic-not-a-credential-{n}" if n == 0 else None,
                           scope="synthetic-scope" if n == 0 else None,
                           created_at=STAMP, updated_at=STAMP),
                    insert("session", id=f"session-{n}", user_id=user,
                           token=f"synthetic-session-placeholder-{n}", expires_at=LATER,
                           ip_address="192.0.2.1" if n == 0 else None,
                           user_agent="Synthetic rehearsal" if n == 0 else None,
                           created_at=STAMP, updated_at=STAMP),
                    insert("auth_verification", id=f"code-{n}",
                           identifier=f"sign-in-otp-{user}@example.invalid",
                           value=digest(f"synthetic-hashed-code-placeholder-{n}".encode()) + ":0",
                           expires_at=LATER, created_at=STAMP, updated_at=STAMP)]
    return "\n".join(sql)


def preserved(before, after, step):
    allowed = {5: {"engagement_log"}, 6: {"verification_case"},
               7: {"verification_case"}}.get(step, set())
    for item in before["schema"]:
        if item["type"] == "table" and item["name"] in allowed:
            continue
        require(item in after["schema"], f"000{step}: changed existing schema {item['name']}")
    for table, rows in before["data"].items():
        if table == "d1_migrations":
            require(all(row in after["data"][table] for row in rows), "Ledger history changed")
            continue
        expected = [{**row, "submitted_profile": None} for row in rows] if step == 7 and table == "verification_case" else rows
        require(after["data"][table] == expected, f"000{step}: changed rows in {table}")
        if table not in allowed:
            require(before["columns"][table] == after["columns"][table], f"Changed columns: {table}")
            require(before["fks"][table] == after["fks"][table], f"Changed FKs: {table}")


def summarize(state):
    return {"snapshot_sha256": digest(state), "schema_sha256": digest(state["schema"]),
            "rows": {table: len(rows) for table, rows in state["data"].items()},
            "auth_rows_sha256": digest({t: state["data"][t] for t in sorted(AUTH)}),
            "schema_objects": len(state["schema"]),
            "triggers": sorted(s["name"] for s in state["schema"] if s["type"] == "trigger"),
            "foreign_keys": 1, "foreign_key_check": []}


def ledger(state, count):
    rows = state["data"]["d1_migrations"]
    require(len(rows) == count, "Wrong migration ledger length")
    require(sorted(row["name"] for row in rows) == list(MIGRATIONS[:count]), "Wrong migration names")
    require(sorted(row["id"] for row in rows) == list(range(1, count + 1)), "Wrong migration ledger IDs")
    require(all(row["applied_at"] for row in rows), "Missing migration timestamps")


def final_schema(state):
    require({s["name"] for s in state["schema"] if s["type"] == "trigger"} == TRIGGERS,
            "Expected exactly fourteen named triggers")
    column = next(c for c in state["columns"]["verification_case"] if c["name"] == "submitted_profile")
    require(column["notnull"] == 0 and column["dflt_value"] is None
            and column["type"].lower() == "text", "Snapshot column must be nullable without default")
    require(all(row["submitted_profile"] is None for row in state["data"]["verification_case"]),
            "Historical snapshot evidence fabricated")
    require(state["data"]["verification_case"] == [], "Production-shape fixture acquired feature rows")
    groups = {}
    for row in state["fks"]["engagement_log"]:
        groups.setdefault(row["id"], []).append(row)
    expected = [("engagement", "engagement_id", "id", "RESTRICT"),
                ("engagement", "freelancer_id", "freelancer_id", "RESTRICT"),
                ("engagement", "client_id", "client_id", "RESTRICT")]
    require(any([(r["table"], r["from"], r["to"], r["on_delete"]) for r in sorted(rows, key=lambda r: r["seq"])] == expected
                for rows in groups.values()), "Missing composite engagement parties FK")


def compatibility(db, config):
    """SQL shapes from old main auth/schema + queries/viewer.ts, no mail/HTTP.

    Scratch rows are removed through USER cascade (the published receipt trigger
    permits it); original auth values and the entire state must remain identical.
    """
    before = db.snapshot(config)
    sql = [insert("user", id="compat", name="Synthetic compatibility", email="compat@example.invalid",
                  email_verified=1, created_at=STAMP, updated_at=STAMP),
           "SELECT id,name,email,role,banned FROM user WHERE id='compat' LIMIT 1;",
           "UPDATE user SET role='freelancer',updated_at='2026-10-01T00:00:00.000Z' "
           "WHERE id='compat' AND role IS NULL RETURNING id;",
           "UPDATE user SET role='client' WHERE id='compat' AND role IS NULL RETURNING id;",
           insert("session", id="compat-session", user_id="compat", token="synthetic-compat-session", expires_at=LATER),
           "SELECT session.id,user.role,user.banned FROM session INNER JOIN user ON session.user_id=user.id "
           "WHERE session.token='synthetic-compat-session' AND session.expires_at > '2026-10-01' LIMIT 1;",
           "UPDATE session SET expires_at='2027-11-01T00:00:00.000Z',updated_at='2026-10-02T00:00:00.000Z' WHERE id='compat-session';",
           insert("account", id="compat-account", user_id="compat", provider_id="credential", account_id="synthetic-compat-account"),
           "SELECT id,user_id,provider_id,account_id,access_token,refresh_token,id_token,password FROM account WHERE user_id='compat';",
           insert("auth_verification", id="compat-code", identifier="sign-in-otp-compat@example.invalid",
                  value=digest(b"synthetic-compat-hashed-placeholder") + ":0", expires_at=LATER),
           "UPDATE auth_verification SET value='synthetic-hashed-placeholder:1' WHERE id='compat-code';",
           "SELECT id,identifier,value,expires_at FROM auth_verification WHERE identifier='sign-in-otp-compat@example.invalid';"]
    for n, policy in enumerate(("privacy", "terms", "freelancer_ack")):
        sql.append(insert("policy_acceptance", id=f"compat-receipt-{n}", user_id="compat", policy=policy,
                          version="2026-10-12", accepted_at=STAMP))
    sql += ["SELECT policy,version FROM policy_acceptance WHERE user_id='compat' ORDER BY policy;",
            insert("policy_acceptance", id="compat-reaccept", user_id="compat", policy="privacy", version="2026-10-26", accepted_at=STAMP),
            "SELECT count(*) AS n FROM policy_acceptance WHERE user_id='compat' AND policy='privacy';"]
    results = db.sql(config, "\n".join(sql))
    require(results[1][0]["role"] is None, "Old viewer null-role read failed")
    require(results[2] == [{"id": "compat"}] and results[3] == [], "Old chooseRole CAS failed")
    require(results[5] == [{"id": "compat-session", "role": "freelancer", "banned": 0}], "Session join failed")
    require(results[8][0]["password"] is None, "Account read failed")
    require(results[11][0]["value"] == "synthetic-hashed-placeholder:1", "Code update/read failed")
    require(results[15] == [{"policy": p, "version": "2026-10-12"} for p in ("freelancer_ack", "privacy", "terms")],
            "Old policy receipt read failed")
    require(results[17] == [{"n": 2}], "Policy reacceptance overwrote history")
    db.sql(config, "DELETE FROM session WHERE id='compat-session'; DELETE FROM account WHERE id='compat-account'; "
           "DELETE FROM auth_verification WHERE id='compat-code'; DELETE FROM user WHERE id='compat';")
    require(db.snapshot(config) == before, "Compatibility SQL changed original state")
    return "PASS: viewer/null-role CAS/session CRUD/account CRUD/hashed-code CRUD/versioned receipts/reacceptance; exact cleanup"


def negative_probes(db, config):
    before = db.snapshot(config)
    probes = [
        ("UPDATE policy_acceptance SET version='synthetic-mutation' WHERE id='receipt-0';", "append-only"),
        ("DELETE FROM policy_acceptance WHERE id='receipt-0';", "append-only"),
        (insert("session", id="orphan", user_id="missing", token="synthetic-orphan", expires_at=LATER), "FOREIGN KEY"),
        ("UPDATE user SET role='invalid-role' WHERE id='freelancer';", "CHECK constraint"),
    ]
    for sql, expected in probes:
        db.sql(config, sql, expected_error=expected)
    require(db.snapshot(config) == before, "Rejected SQL changed original state")
    return len(probes)


def restore(db, config, migrations, label, expected):
    export = db.root / f"{label}.sql"
    db.command(config, "export", "synthetic-rehearsal", "--output", export)
    require(export.is_file() and export.stat().st_size > 0, "Missing local SQL export")
    # Record the real exporter limitation: it interleaves account creation/data
    # before USER exists. Deferred FKs cannot resolve an absent parent table.
    raw_target = db.config(f"{label}-raw-import", migrations)
    db.command(raw_target, "execute", "synthetic-rehearsal", "--file", export,
               expected_error="no such table: main.user")
    raw_state = db.snapshot(raw_target)
    # Universal-newline text reads would silently rewrite CRLF inside stored
    # CREATE statements. Decode bytes so sqlite_schema SQL survives exactly.
    ordered_sql, ordering = order_export(export.read_bytes().decode("utf-8"))
    ordered_export = db.root / f"{label}-ordered.sql"
    ordered_export.write_text(ordered_sql, encoding="utf-8", newline="\n")
    target = db.config(f"{label}-restored", migrations)
    db.command(target, "execute", "synthetic-rehearsal", "--file", ordered_export)
    actual = db.snapshot(target)
    require(actual == expected, f"{label}: Wrangler export/import schema/data/ledger/columns/FKs differ")
    return {"sql_sha256": digest(export.read_bytes()), "sql_bytes": export.stat().st_size,
            "raw_full_import": "EXPECTED FAILURE: no such table: main.user (interleaved exporter order)",
            "raw_failure_remaining_schema_objects": len(raw_state["schema"]),
            "restore_method": "Original Wrangler export statement ordering only: PRAGMA/tables/indexes/counter reset/data/triggers; no statement/value changes",
            "ordering": ordering, "ordered_export_sha256": digest(ordered_export.read_bytes()),
            "exact_restore": True, "snapshot": summarize(actual),
            "old_main_sql": compatibility(db, target),
            "constraint_rejections": negative_probes(db, target)}


def run_rehearsal(evidence):
    scripts = {name: (ROOT / "web/drizzle" / name).read_bytes() for name in MIGRATIONS}
    require(all(digest(scripts[name]) in REVIEWED_CHECKOUT_SHA256[name] for name in MIGRATIONS),
            "Published SQL differs from reviewed hashes; explicit review required")
    evidence["migration_sha256"] = {name: digest(sql) for name, sql in scripts.items()}
    node = shutil.which("node")
    require(node and CLI.is_file(), "Install pinned local dependencies/Node before rehearsal (no auto-install)")
    evidence["wrangler"] = json.loads((CLI.parent.parent / "package.json").read_text())["version"]
    require(evidence["wrangler"] == "4.149.0", "Unexpected Wrangler version")
    with owned_temporary(evidence) as directory:
        db = LocalD1(directory, node, evidence)
        evidence["node"] = db.run([node, "--version"], cli=False).strip()
        require(evidence["node"] == "v24.22.1", "Exactly Node 24.22.1 required")
        for rich in (True, False):
            label = "rich-auth-only" if rich else "observed-sparse-shape"
            migrations = db.root / f"{label}-migrations"
            migrations.mkdir()
            for name in MIGRATIONS[:3]:
                (migrations / name).write_bytes(scripts[name])
            config = db.config(label, migrations)
            db.apply(config)
            db.sql(config, seed(rich))
            original = db.snapshot(config)
            ledger(original, 3)
            require(all(not rows for table, rows in original["data"].items() if table not in AUTH | {"d1_migrations"}),
                    "Old production fixture has feature data")
            result = {"pre0003": summarize(original), "steps": []}
            evidence[label] = result
            result["pre0003_old_main_sql"] = compatibility(db, config)
            if rich:
                result["pre0003_restore"] = restore(db, config, migrations, "pre0003", original)
            before = original
            for step in range(3, 8):
                name = MIGRATIONS[step]
                (migrations / name).write_bytes(scripts[name])
                require((migrations / name).read_bytes() == scripts[name], "Migration copy differs")
                db.apply(config)
                after = db.snapshot(config)
                preserved(before, after, step)
                require({t: after["data"][t] for t in AUTH} == {t: original["data"][t] for t in AUTH},
                        "Original auth rows changed")
                ledger(after, step + 1)
                require(len([s for s in after["schema"] if s["type"] == "trigger"]) == (14 if step == 7 else 13 if step == 6 else 2),
                        "Wrong staged trigger count")
                result["steps"].append({"migration": name, "preservation": "PASS", **summarize(after),
                                        "old_main_sql": compatibility(db, config)})
                print(f"PASS: {label} {name}; auth/schema/ledger/FKs/old-main SQL", flush=True)
                before = after
            final_schema(after)
            result["final_old_main_sql"] = compatibility(db, config)
            db.apply(config)
            require(db.snapshot(config) == after, "Reapplication was not an exact no-op")
            result["reapplication"] = "PASS: exact snapshot including ledger unchanged"
            if rich:
                result["post0007_restore"] = restore(db, config, migrations, "post0007", after)
                # A separate empty local database exercises fresh 0000-0007.
                fresh = db.config("fresh", migrations)
                db.apply(fresh)
                fresh_state = db.snapshot(fresh)
                ledger(fresh_state, 8)
                final_schema(fresh_state)
                require(fresh_state["schema"] == after["schema"] and fresh_state["columns"] == after["columns"]
                        and fresh_state["fks"] == after["fks"], "Fresh and upgraded schemas differ")
                db.apply(fresh)
                require(db.snapshot(fresh) == fresh_state, "Fresh reapplication changed state")
                evidence["fresh"] = {**summarize(fresh_state), "reapplication": "PASS: exact no-op",
                                     "schema_matches_upgrade": True, "old_main_sql": compatibility(db, fresh)}


def write_report(evidence):
    directory = ROOT / ".local-evidence/production-rehearsal"
    # Refuse redirected paths; write only a fixed, atomic local evidence file.
    for path in (ROOT / ".local-evidence", directory, directory / "report.json"):
        if path.exists() or path.is_symlink():
            info = path.lstat()
            require(not stat.S_ISLNK(info.st_mode) and not
                    (getattr(info, "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT),
                    f"Refusing redirected evidence path: {path}")
    directory.mkdir(parents=True, exist_ok=True)
    require(directory.resolve() == directory, "Evidence directory escaped repository")
    target = directory / "report.json"
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=directory,
                                     prefix="report-", suffix=".tmp", delete=False) as out:
        staging = Path(out.name)
        try:
            json.dump(evidence, out, indent=2, sort_keys=True)
            out.write("\n")
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
    argparse.ArgumentParser(description=__doc__).parse_args()  # Deliberately no target override.
    revision = subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True).strip()
    old = subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "main"], text=True).strip()
    old_paths = ["web/src/server/auth/config.ts", "web/src/server/db/schema.ts",
                 "web/src/server/db/queries/viewer.ts", "web/src/features/onboarding/accept.ts",
                 "web/src/lib/policies.ts"]
    evidence = {"utc": datetime.now(timezone.utc).isoformat(), "source_revision": revision,
                "script_sha256": digest(Path(__file__).read_bytes()), "old_main_revision": old,
                "old_main_sources_sha256": {path: digest(subprocess.check_output(
                    ["git", "-C", str(ROOT), "show", f"{old}:{path}"])) for path in old_paths},
                "commands": [], "result": "RUNNING",
                "scope": "Synthetic real Wrangler/workerd local D1 only; no provider, credentials, developer DB or network service access",
                "limits": ["Old-main compatibility uses handwritten SQL matching the inspected old schema/viewer/auth shapes, not a full old Worker or mail/OAuth test",
                           "Empty feature-table production shape only; populated 0005 rejection and invalid 0006/0007 rollback remain covered by unchanged Workers tests",
                           "Local SQL export/import is not production backup encryption, Time Travel, concurrent writes, remote restore, R2 recovery or deployment acceptance",
                           "D1 integrity_check is unsupported; exact schema/row/column/FK comparison and foreign_key_check are used",
                           "No raw rows, session/code placeholders, export SQL or credentials are retained in this report"]}
    try:
        run_rehearsal(evidence)
        evidence["result"] = "PASS"
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        evidence["result"] = "FAIL"
        # All command inputs are synthetic; still avoid retaining SQL/row output.
        evidence["failure"] = str(error).split(": ")[0][:300]
        print(f"FAIL: {error}", file=sys.stderr)
    path = write_report(evidence)
    print(f"{evidence['result']}: local production migration rehearsal; report {path}")
    return 0 if evidence["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
