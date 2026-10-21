"""Run the repository's pinned SPINE engine without changing a shared checkout."""

from contextlib import contextmanager
import io
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parents[1]


def metadata(root):
    pointer = (root / "AGENTS.md").read_text(encoding="utf-8")
    version = re.search(r"Pinned engine:\*\* SPINE (\d+\.\d+\.\d+)", pointer)
    fallback = re.search(r"local_fallback:\*\* `([^`]+)`", pointer)
    if not version or not fallback:
        raise ValueError("AGENTS.md must specify the pinned version and local_fallback")
    return version[1], Path(fallback[1])


def local_source(fallback):
    candidates = [Path(os.environ["SPINE_HOME"])] if os.environ.get("SPINE_HOME") else []
    candidates.extend([fallback, Path.home() / ".spine" / "engine"])
    for candidate in candidates:
        if (candidate / "AGENTS.md").is_file():
            return candidate
    raise ValueError("No local SPINE engine found; restore the configured clone before running checks")


def verify_version(engine, version):
    text = (engine / "AGENTS.md").read_text(encoding="utf-8")
    if not re.search(rf"\*\*SPINE {re.escape(version)}\*\*", text):
        raise ValueError(f"SPINE {version} is required; the local engine differs and its pinned tag is unavailable")


@contextmanager
def pinned_engine(source, version):
    # Read the tag without checking it out, installing anything, or using the network.
    archive = subprocess.run(
        ["git", "-C", str(source), "archive", "--format=zip", f"refs/tags/v{version}",
         "AGENTS.md", "scripts", "templates"],
        capture_output=True, check=False,
    )
    if archive.returncode:
        verify_version(source, version)
        yield source
        return
    # OS temporary storage is removed automatically; repo temporary/ is not used.
    with tempfile.TemporaryDirectory(prefix=f"flag-spine-{version}-") as directory:
        engine = Path(directory)
        with zipfile.ZipFile(io.BytesIO(archive.stdout)) as snapshot:
            for name in snapshot.namelist():
                if not (engine / name).resolve().is_relative_to(engine.resolve()):
                    raise ValueError("SPINE archive contains a path outside the snapshot")
            snapshot.extractall(engine)
        verify_version(engine, version)
        yield engine


def main(args=None):
    args = list(sys.argv[1:] if args is None else args)
    if not args or args[0] not in {"engine", "template", "check", "checkpoint"}:
        print("Usage: python scripts/spine.py engine | template CODE | check [args] | checkpoint [args]", file=sys.stderr)
        return 2
    command, *arguments = args
    try:
        version, fallback = metadata(ROOT)
        with pinned_engine(local_source(fallback), version) as engine:
            if command in {"engine", "template"}:
                if command == "template":
                    if len(arguments) != 1 or not re.fullmatch(r"[A-Za-z]+", arguments[0]):
                        raise ValueError("template requires one document code, such as BUILD")
                    path = engine / "templates" / f"{arguments[0].upper()}_Template.md"
                else:
                    path = engine / "AGENTS.md"
                print(path.read_text(encoding="utf-8"))
                return 0
            defaults = ["docs/"] if command == "check" else ["verify"]
            return subprocess.run([sys.executable, str(engine / "scripts" / f"{command}.py"),
                                   *(arguments or defaults)], cwd=ROOT,
                                  env={**os.environ, "PYTHONIOENCODING": "utf-8"}, check=False).returncode
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(f"SPINE: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    # Windows redirected stdout may otherwise use cp1252, which cannot print
    # the canonical engine/templates' arrows and other Unicode characters.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    raise SystemExit(main())
