"""Windows-only, synthetic backup regression tests; never export remote D1.

Run from the repository root: python -m unittest discover -s scripts -p test_backup_d1.py
The PowerShell self-test invokes the production encryption/cleanup function with
synthetic byte producers, creates disposable encrypted fixtures under temporary/,
and removes them. Plan checks read only public source configuration.
"""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "backup-d1.ps1"
POWERSHELL = shutil.which("powershell.exe") if os.name == "nt" else None


@unittest.skipUnless(POWERSHELL, "Windows PowerShell and DPAPI CurrentUser required")
class BackupD1Tests(unittest.TestCase):
    def run_script(self, *arguments, extra_env=None):
        env = os.environ.copy()
        if extra_env:
            env.update(extra_env)
        return subprocess.run(
            [POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(SCRIPT), *arguments],
            cwd=ROOT, env=env, capture_output=True, text=True, timeout=60,
        )

    def assert_refused(self, *arguments, extra_env=None):
        result = self.run_script(*arguments, extra_env=extra_env)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("MUST_NOT_LEAK", result.stdout + result.stderr)
        self.assertNotIn("SYNTHETIC SQL", result.stdout + result.stderr)
        return result

    def test_failure_stage_is_fixed_and_does_not_echo_account_override(self):
        result = self.assert_refused("-Target", "dev", extra_env={
            "CF_ACCOUNT_ID": "MUST_NOT_LEAK-conflicting-account",
        })
        self.assertIn("FLAG_BACKUP_FAILED stage=account_override", result.stderr)

    def test_actual_dpapi_and_failure_cleanup(self):
        before = set((ROOT / "temporary").glob("backup-selftest-*"))
        # SelfTest uses synthetic Node producers, not installed Wrangler or data.
        result = self.run_script("-Mode", "SelfTest", extra_env={
            "CLOUDFLARE_API_TOKEN": "MUST_NOT_LEAK-synthetic-no-network-token",
        })
        self.assertEqual(result.returncode, 0, result.stderr)
        rows = json.loads(result.stdout)
        self.assertEqual({row["Case"] for row in rows}, {
            "success", "export", "empty", "write", "verify", "overwrite", "race", "cleanup",
            "native_stderr", "native_failure", "native_empty_env", "native_arguments",
        })
        self.assertTrue(all(row["Passed"] and row["PlaintextCleaned"] for row in rows))
        stages = {row["Case"]: row.get("FailureStage") for row in rows}
        self.assertEqual(stages["native_failure"], "export_native")
        self.assertEqual(stages["cleanup"], "cleanup")
        self.assertEqual(stages["verify"], "verify_artifact")
        self.assertIsNone(stages["native_stderr"])
        self.assertIsNone(stages["native_empty_env"])
        self.assertEqual(set((ROOT / "temporary").glob("backup-selftest-*")), before)
        self.assertNotIn("MUST_NOT_LEAK", result.stdout + result.stderr)

    def test_default_plan_has_exact_approved_target_and_no_execution(self):
        for target, database, database_id, env_flag in [
            ("dev", "flag-db-dev", "54aca5df-2ae7-4150-bd75-0f6365e5bfa3", "--env=dev"),
            ("production", "flag-db", "e196d1b5-82e7-45bf-b1c5-725fa1faf184", "--env= "),
        ]:
            with self.subTest(target=target):
                result = self.run_script("-Target", target)
                self.assertEqual(result.returncode, 0, result.stderr)
                plan = json.loads(result.stdout)
                self.assertEqual(plan["Mode"], "Plan")
                self.assertFalse(plan["Executed"])
                self.assertEqual(plan["Account"], "1af65da586efd62d6f6d429240395f28")
                self.assertEqual(plan["Database"], database)
                self.assertEqual(plan["DatabaseId"], database_id)
                self.assertIn('node.exe "' + str(ROOT / "web/node_modules/wrangler/bin/wrangler.js") + '" d1 export ' + database, plan["Command"])
                self.assertIn(env_flag, plan["Command"])
                self.assertIn("--remote", plan["Command"])
                self.assertIn("--skip-confirmation", plan["Command"])
                self.assertNotIn("--yes", plan["Command"])
                self.assertTrue(plan["Output"].endswith(".sql.dpapi"))

    def test_installed_export_parser_accepts_confirmation_flag_without_remote(self):
        # The local handler rejects the absent synthetic binding before opening
        # any local DB. Never pass --remote, project config or real target names.
        node = shutil.which("node.exe")
        entry = ROOT / "web/node_modules/wrangler/bin/wrangler.js"
        self.assertTrue(node and entry.is_file(), "Installed Node/Wrangler required")
        env = os.environ.copy()
        env.update({
            "WRANGLER_SEND_METRICS": "false", "WRANGLER_WRITE_LOGS": "false",
            "WRANGLER_LOG": "error", "WRANGLER_LOG_SANITIZE": "true",
            "CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV": "false",
            "CLOUDFLARE_API_TOKEN": "MUST_NOT_LEAK-synthetic-no-network-token",
            "CI": "true",
        })
        with tempfile.TemporaryDirectory(prefix="flag-backup-parser-") as directory:
            scratch = Path(directory)
            config = scratch / "wrangler.json"
            config.write_text(json.dumps({"name": "synthetic-parser", "d1_databases": []}))
            output = scratch / "never-created.sql"
            for flag, expected in [
                ("--yes", "Unknown argument: yes"),
                ("--skip-confirmation", "Couldn't find a D1 DB"),
            ]:
                with self.subTest(flag=flag):
                    result = subprocess.run([
                        node, str(entry), "d1", "export", "synthetic-missing-binding", "--local",
                        "--config", str(config), "--cwd", directory, "--output", str(output), flag,
                    ], cwd=directory, env=env, capture_output=True, text=True, timeout=30)
                    self.assertNotEqual(result.returncode, 0)
                    diagnostic = result.stdout + result.stderr
                    self.assertTrue(expected in diagnostic, "Unexpected synthetic parser outcome")
                    self.assertNotIn("MUST_NOT_LEAK", diagnostic)
                    self.assertFalse(output.exists())

    def test_no_implicit_target_or_execution_approval(self):
        for arguments in [
            (), ("-Target", "staging"),
            ("-Mode", "Backup", "-Target", "dev"),
            ("-Mode", "Backup", "-Target", "production", "-PrerequisitesVerified"),
            ("-Mode", "SelfTest", "-Target", "dev"),
        ]:
            with self.subTest(arguments=arguments):
                self.assert_refused(*arguments)

    def test_output_paths_and_override_are_refused(self):
        for name in ["../escape.sql.dpapi", "C:\\escape.sql.dpapi", "data.sql", "bad.sql.dpapi:stream"]:
            with self.subTest(name=name):
                self.assert_refused("-Target", "dev", "-OutputName", name)
        for variable in ["CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID"]:
            self.assert_refused("-Target", "dev", extra_env={
                variable: "MUST_NOT_LEAK-conflicting-account",
            })

    def test_temp_inside_repository_is_refused_and_cleaned(self):
        # SelfTest deliberately uses the caller's temp path. Pointing it at the
        # repo proves the plaintext-location guard and test-fixture finally path.
        before = set((ROOT / "temporary").glob("backup-selftest-*"))
        self.assert_refused("-Mode", "SelfTest", extra_env={"TEMP": str(ROOT), "TMP": str(ROOT)})
        self.assertEqual(set((ROOT / "temporary").glob("backup-selftest-*")), before)


if __name__ == "__main__":
    unittest.main()
