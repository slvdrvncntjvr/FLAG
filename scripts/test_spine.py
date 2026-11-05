import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

import spine


class PinnedEngineTests(unittest.TestCase):
    def git(self, directory, *args):
        return subprocess.run(["git", "-C", str(directory), *args], check=True, capture_output=True)

    def engine_repo(self, directory):
        (directory / "scripts").mkdir()
        (directory / "templates").mkdir()
        (directory / "AGENTS.md").write_text("**SPINE 0.3.0**\n", encoding="utf-8")
        (directory / "templates" / "BUILD_Template.md").write_text("pinned template \u2192 ready", encoding="utf-8")
        (directory / "scripts" / "check.py").write_text(
            "import json, os, sys\nprint(json.dumps([os.getcwd(), sys.argv[1:]]))\nraise SystemExit(7 if '--strict' in sys.argv else 0)\n", encoding="utf-8")
        self.git(directory, "init")
        self.git(directory, "add", ".")
        self.git(directory, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "Pinned engine")
        self.git(directory, "tag", "v0.3.0")
        (directory / "AGENTS.md").write_text("**SPINE 0.4.0**\n", encoding="utf-8")

    def run_cli(self, source, *args):
        return subprocess.run([spine.sys.executable, str(spine.ROOT / "scripts" / "spine.py"), *args],
                              env={**os.environ, "SPINE_HOME": str(source), "PYTHONIOENCODING": "cp1252"},
                              capture_output=True, text=True, encoding="utf-8")

    def test_pinned_tag_preserves_shared_checkout_and_snapshot_is_removed(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)
            self.engine_repo(source)
            with spine.pinned_engine(source, "0.3.0") as engine:
                snapshot = engine
                self.assertEqual((engine / "AGENTS.md").read_text(), "**SPINE 0.3.0**\n")
                self.assertEqual((source / "AGENTS.md").read_text(), "**SPINE 0.4.0**\n")
            self.assertFalse(snapshot.exists())

    def test_cli_forwards_arguments_from_project_root_and_reads_pinned_templates(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)
            self.engine_repo(source)
            result = self.run_cli(source, "check", "docs/", "--strict")
            self.assertEqual(result.returncode, 7, result.stderr)
            self.assertEqual(json.loads(result.stdout), [str(spine.ROOT), ["docs/", "--strict"]])
            result = self.run_cli(source, "template", "BUILD")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), "pinned template \u2192 ready")

    def test_refuses_unpinned_engine_when_tag_is_unavailable(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory)
            (source / "AGENTS.md").write_text("**SPINE 0.4.0**\n", encoding="utf-8")
            result = self.run_cli(source, "engine")
            self.assertEqual(result.returncode, 1)
            self.assertIn("0.3.0 is required", result.stderr)


if __name__ == "__main__":
    unittest.main()
