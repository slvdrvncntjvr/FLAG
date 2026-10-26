"""Focused safety/ordering tests; actual local D1 execution is a separate gate."""

from collections import Counter
from pathlib import Path
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import production_migration_rehearsal as rehearsal


class ProductionMigrationRehearsalTests(unittest.TestCase):
    def test_ordering_preserves_trigger_and_quoted_semicolons_and_all_values(self):
        sql = """PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE account(id TEXT PRIMARY KEY, user_id TEXT REFERENCES user(id));
INSERT INTO account VALUES('synthetic;child','parent');
CREATE TRIGGER receipt_frozen BEFORE DELETE ON receipt BEGIN
  SELECT RAISE(ABORT,'append-only; original');
END;
CREATE TABLE receipt(id TEXT PRIMARY KEY, user_id TEXT REFERENCES user(id));
INSERT INTO receipt VALUES('receipt','parent');
CREATE TABLE user(id TEXT PRIMARY KEY);
INSERT INTO user VALUES('parent');
CREATE INDEX account_user ON account(user_id);
"""
        sql = sql.replace("\n", "\r\n")  # Stored CREATE SQL must keep its line endings.
        # Reproduce missing-parent failure with always-on FKs first; this unit
        # probe is explicitly native SQLite, not the Wrangler acceptance gate.
        with sqlite3.connect(":memory:", isolation_level=None) as db:
            db.execute("PRAGMA foreign_keys=ON")
            db.execute("BEGIN")
            with self.assertRaisesRegex(sqlite3.OperationalError, "no such table"):
                for statement in rehearsal.export_statements(sql):
                    db.execute(statement)
            db.execute("ROLLBACK")
        ordered, evidence = rehearsal.order_export(sql)
        self.assertEqual(Counter(rehearsal.export_statements(sql)),
                         Counter(rehearsal.export_statements(ordered)))
        self.assertTrue(evidence["exact_statement_multiset"])
        with sqlite3.connect(":memory:", isolation_level=None) as db:
            db.execute("PRAGMA foreign_keys=ON")
            db.execute("BEGIN")
            for statement in rehearsal.export_statements(ordered):
                db.execute(statement)
            db.execute("COMMIT")
            self.assertEqual(db.execute("SELECT * FROM account").fetchall(), [("synthetic;child", "parent")])
            self.assertEqual(db.execute("PRAGMA foreign_keys").fetchone(), (1,))
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
            with self.assertRaisesRegex(sqlite3.IntegrityError, "append-only"):
                db.execute("DELETE FROM receipt")

    def test_ordering_rejects_unexpected_mutations_off_pragma_and_truncated_sql(self):
        for unexpected in ("DELETE FROM user;", "DROP TABLE user;", "UPDATE user SET id='x';",
                           "PRAGMA foreign_keys=OFF;", "BEGIN;", "SELECT 1;", "CREATE TABLE t(id"):
            with self.subTest(sql=unexpected), self.assertRaises(RuntimeError):
                rehearsal.order_export("PRAGMA defer_foreign_keys=TRUE;\n" + unexpected)
        with self.assertRaisesRegex(RuntimeError, "deferred-FK"):
            rehearsal.order_export("CREATE TABLE t(id);")

    def test_only_exported_internal_sequence_reset_is_allowed(self):
        sql = "PRAGMA defer_foreign_keys=TRUE; CREATE TABLE t(id INTEGER PRIMARY KEY AUTOINCREMENT); DELETE FROM sqlite_sequence; INSERT INTO sqlite_sequence VALUES('t',8);"
        ordered, _ = rehearsal.order_export(sql)
        self.assertEqual(Counter(rehearsal.export_statements(sql)),
                         Counter(rehearsal.export_statements(ordered)))
        for mutation in ("DELETE FROM sqlite_sequence WHERE name='user';", "DELETE FROM user;"):
            with self.assertRaises(RuntimeError):
                rehearsal.order_export("PRAGMA defer_foreign_keys=TRUE;" + mutation)

    def test_provider_credentials_and_real_user_paths_are_not_inherited(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"PATH": "platform-path", "CLOUDFLARE_API_TOKEN": "must-not-inherit",
                                        "BREVO_API_KEY": "must-not-inherit", "NODE_OPTIONS": "must-not-inherit",
                                        "HOME": "real-home", "APPDATA": "real-appdata",
                                        "HTTPS_PROXY": "credential-bearing-proxy"}, clear=True):
                env = rehearsal.isolated_environment(Path(directory))
            self.assertEqual(env["PATH"], "platform-path")
            for key in ("CLOUDFLARE_API_TOKEN", "BREVO_API_KEY", "NODE_OPTIONS"):
                self.assertNotIn(key, env)
            for key in ("HOME", "APPDATA", "USERPROFILE", "LOCALAPPDATA", "TEMP"):
                self.assertEqual(env[key], directory)
            self.assertEqual(env["WRANGLER_SEND_METRICS"], "false")
            self.assertEqual(env["CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV"], "false")
            self.assertEqual(env["HTTPS_PROXY"], "http://127.0.0.1:9")

    def test_failure_cleans_owned_state_and_preserves_outside_sentinel(self):
        evidence = {}
        with tempfile.TemporaryDirectory() as outside:
            sentinel = Path(outside) / "developer.sqlite3"
            sentinel.write_bytes(b"preserve existing state")
            with self.assertRaisesRegex(RuntimeError, "injected failure"):
                with rehearsal.owned_temporary(evidence) as directory:
                    owned = Path(directory)
                    (owned / "synthetic.sql").write_text("synthetic")
                    raise RuntimeError("injected failure")
            self.assertFalse(owned.exists())
            self.assertEqual(sentinel.read_bytes(), b"preserve existing state")
            self.assertIn("PASS", evidence["cleanup"])

    def test_cli_rejects_remote_and_target_paths_before_any_work(self):
        for option in ("--remote", "--database", "--config", "--persist-to", "--report"):
            result = subprocess.run([sys.executable, rehearsal.__file__, option, "forbidden"],
                                    capture_output=True, text=True, timeout=15)
            self.assertEqual(result.returncode, 2, result.stderr)

    def test_modified_published_migration_is_rejected_before_wrangler(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migrations = root / "web/drizzle"
            migrations.mkdir(parents=True)
            for name in rehearsal.MIGRATIONS:
                (migrations / name).write_bytes((rehearsal.ROOT / "web/drizzle" / name).read_bytes())
            with (migrations / rehearsal.MIGRATIONS[-1]).open("a") as out:
                out.write("\nDROP TABLE user;\n")
            with patch.object(rehearsal, "ROOT", root), \
                    patch.object(rehearsal, "CLI", root / "absent-wrangler.js"), \
                    patch.object(rehearsal.shutil, "which", return_value=None), \
                    patch.object(rehearsal.LocalD1, "run") as run:
                with self.assertRaisesRegex(RuntimeError, "reviewed hashes"):
                    rehearsal.run_rehearsal({})
                run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
