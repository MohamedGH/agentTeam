from pathlib import Path
import subprocess
import shlex


PROJECT_ROOT = Path.cwd().resolve()

PROTECTED_DIRS = {
    ".git",
    ".venv",
    "node_modules",
    "__pycache__",
}

PROTECTED_FILES = {
    ".env",
    ".env.local",
}


def _safe_path(path: str) -> Path:
    target = (PROJECT_ROOT / path).resolve()

    if target != PROJECT_ROOT and PROJECT_ROOT not in target.parents:
        raise ValueError("Access outside project directory is forbidden")

    if target.name in PROTECTED_FILES:
        raise ValueError(f"Protected file: {target.name}")

    for parent in target.parents:
        if parent.name in PROTECTED_DIRS:
            raise ValueError(f"Protected directory: {parent.name}")

    return target


def read_file(path: str) -> str:
    try:
        target = _safe_path(path)

        if not target.exists():
            return f"ERROR: File does not exist: {path}"

        return target.read_text(encoding="utf-8")

    except Exception as e:
        return f"ERROR: {e}"


def write_file(path: str, content: str) -> str:
    try:
        target = _safe_path(path)

        if target.exists():
            return (
                f"ERROR: {path} already exists. "
                "Use patch_file instead."
            )

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")

        return f"CREATED: {path}"

    except Exception as e:
        return f"ERROR: {e}"


def patch_file(path: str, old_text: str, new_text: str) -> str:
    try:
        target = _safe_path(path)

        if not target.exists():
            return f"ERROR: File does not exist: {path}"

        content = target.read_text(encoding="utf-8")

        count = content.count(old_text)

        if count == 0:
            return f"ERROR: Target text not found in {path}"

        if count > 1:
            return (
                f"ERROR: Target text appears {count} times. "
                "Patch must match exactly one block."
            )

        target.write_text(
            content.replace(old_text, new_text, 1),
            encoding="utf-8",
        )

        return f"PATCHED: {path}"

    except Exception as e:
        return f"ERROR: {e}"


ALLOWED_COMMANDS = {
    "python",
    "python3",
    "pytest",
    "pip",
    "ruff",
    "mypy",
    "git",
    "npm",
    "npx",
    "node",
}


def _command_allowed(command: str) -> bool:
    try:
        parts = shlex.split(command, posix=False)

        if not parts:
            return False

        executable = Path(parts[0]).name.lower()

        if executable.endswith(".exe"):
            executable = executable[:-4]

        return executable in ALLOWED_COMMANDS

    except Exception:
        return False


def run_command(command: str) -> str:
    if not _command_allowed(command):
        return (
            "ERROR: Command not allowed.\n"
            f"Command: {command}"
        )

    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=120,
        )

        output = result.stdout + result.stderr

        return (
            f"EXIT CODE: {result.returncode}\n"
            f"{output}"
        )

    except subprocess.TimeoutExpired:
        return "ERROR: Command timed out after 120 seconds."

    except Exception as e:
        return f"ERROR: {e}"


def git_status() -> str:
    return run_command("git status --short")


def git_diff() -> str:
    return run_command("git diff --stat")


def git_checkpoint() -> str:
    try:
        result = subprocess.run(
            ["git", "status", "--porcelain"],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            return "ERROR: Not a Git repository."

        return "CHECKPOINT READY\n" + result.stdout

    except Exception as e:
        return f"ERROR: {e}"

