"""Safety/failure tests for the isolated rehearsal; no developer DBs are opened."""

from contextlib import closing
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import recovery_rehearsal as rehearsal


class RecoveryRehearsalTests(unittest.TestCase):
    def test_end_to_end_preservation_export_restore_and_cleanup(self):
        evidence = rehearsal.rehearse(rehearsal.load_migrations())
        self.assertEqual(evidence["pre0003"]["rows"]["user"], 5)
        self.assertEqual(evidence["pre0003"]["rows"]["policy_acceptance"], 9)
        self.assertEqual(evidence["pre0003"]["rows"]["engagement"], 6)
        self.assertEqual(evidence["post0005"]["rows"]["engagement_log"], 2)
        self.assertEqual(evidence["post0005"]["rows"]["proof_file"], 2)
        for stage in ("pre0003", "post0005"):
            self.assertEqual(evidence[stage]["snapshot_sha256"],
                             evidence[stage + "_restore"]["restored_snapshot_sha256"])
        self.assertEqual(evidence["constraint_probes"], 14)
        self.assertEqual(evidence["post0005_restore"]["constraint_probes"], 14)
        self.assertIn("removed", evidence["cleanup"])
        # A key gate: native PASS must expose the populated transaction hazard.
        self.assertEqual(evidence["d1_transaction_compatibility_probe"]["result"], "blocked")
        self.assertTrue(evidence["d1_transaction_compatibility_probe"]["rollback_preserved"])

    def test_existing_database_and_escaped_paths_are_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            sandbox = rehearsal.Sandbox(directory)
            sentinel = Path(directory) / "existing.sqlite3"
            sentinel.write_bytes(b"existing developer data must survive")
            with self.assertRaises(FileExistsError):
                sandbox.database(sentinel.name)
            for name in ("../existing.sqlite3", "..", str(sentinel.resolve())):
                with self.assertRaises(RuntimeError):
                    sandbox.database(name)
            self.assertEqual(sentinel.read_bytes(), b"existing developer data must survive")

    def test_cli_rejects_database_and_remote_flags_before_any_work(self):
        with tempfile.TemporaryDirectory() as directory:
            sentinel = Path(directory) / "developer.sqlite3"
            sentinel.write_bytes(b"preserve")
            for flag in ("--database", "--remote", "--report"):
                result = subprocess.run([sys.executable, str(Path(rehearsal.__file__)),
                                         flag, str(sentinel)], capture_output=True, text=True)
                self.assertEqual(result.returncode, 2, result.stderr)
            self.assertEqual(sentinel.read_bytes(), b"preserve")
            self.assertEqual(list(Path(directory).iterdir()), [sentinel])

    def test_mid_run_failure_cleans_only_its_owned_directory(self):
        allocated = []
        real_temporary = tempfile.TemporaryDirectory

        def record_directory(*args, **kwargs):
            owned = real_temporary(*args, **kwargs)
            allocated.append(Path(owned.name))
            return owned

        with real_temporary() as outside:
            sentinel = Path(outside) / "developer.sqlite3"
            sentinel.write_bytes(b"keep existing data")
            with patch.object(rehearsal.tempfile, "TemporaryDirectory", record_directory), \
                    patch.object(rehearsal, "seed_pre0005", side_effect=sqlite3.OperationalError("injected failure")):
                with self.assertRaisesRegex(sqlite3.OperationalError, "injected failure"):
                    rehearsal.rehearse(rehearsal.load_migrations())
            self.assertTrue(allocated)
            self.assertTrue(all(not path.exists() for path in allocated))
            self.assertEqual(sentinel.read_bytes(), b"keep existing data")

    def test_modified_sql_fails_review_gate_before_opening_a_db(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migrations = root / "web" / "drizzle"
            migrations.mkdir(parents=True)
            for name, sql in zip(rehearsal.MIGRATIONS, rehearsal.load_migrations()):
                (migrations / name).write_text(sql, encoding="utf-8")
            with (migrations / rehearsal.MIGRATIONS[5]).open("a", encoding="utf-8") as out:
                out.write("\nDROP TABLE user;\n")
            with patch.object(rehearsal, "ROOT", root), \
                    patch.object(rehearsal.Sandbox, "database") as opened:
                with self.assertRaisesRegex(RuntimeError, "review required"):
                    rehearsal.load_migrations()
                opened.assert_not_called()

    def test_foreign_key_negative_probe_detects_removed_enforcement(self):
        scripts = rehearsal.load_migrations()
        with closing(sqlite3.connect(":memory:", isolation_level=None)) as db:
            db.execute("PRAGMA foreign_keys=ON")
            for sql in scripts[:3]:
                db.executescript(sql)
            rehearsal.seed_pre0003(db)
            for sql in scripts[3:5]:
                db.executescript(sql)
            rehearsal.seed_pre0005(db)
            db.executescript(scripts[5])
            sql = "UPDATE engagement_log SET client_id='profile-client2' WHERE id='log-0'"
            rehearsal.rejection(db, sql, "FOREIGN KEY")
            db.execute("PRAGMA foreign_keys=OFF")
            with self.assertRaisesRegex(RuntimeError, "Constraint did not reject"):
                rehearsal.rejection(db, sql, "FOREIGN KEY")

    def test_report_symlink_does_not_overwrite_existing_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sentinel = root / "existing.sqlite3"
            sentinel.write_bytes(b"private existing data")
            (root / "temporary").mkdir()
            target = root / "temporary" / "recovery-rehearsal-report.md"
            try:
                target.symlink_to(sentinel)
            except OSError:
                self.skipTest("OS does not permit unprivileged symlink creation")
            with patch.object(rehearsal, "ROOT", root):
                with self.assertRaisesRegex(RuntimeError, "redirected report path"):
                    rehearsal.write_report({})
            self.assertEqual(sentinel.read_bytes(), b"private existing data")


if __name__ == "__main__":
    unittest.main()
