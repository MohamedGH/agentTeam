export interface VirtualWorkspaceState {
  files: Record<string, string>;
  gitHistory: Array<{ message: string; diff: string; timestamp: number }>;
  commandLogs: string[];
}

export class VirtualWorkspace {
  private files: Map<string, string> = new Map();
  private originalFiles: Map<string, string> = new Map();
  private commandLogs: string[] = [];
  private checkpoints: Array<{ timestamp: number; snapshot: Record<string, string> }> = [];

  private readonly PROTECTED_DIRS = ['.git', '.venv', 'node_modules', '__pycache__'];
  private readonly PROTECTED_FILES = ['.env', '.env.local'];

  constructor() {
    this.seedDefaultFiles();
  }

  public seedDefaultFiles() {
    this.files.clear();
    this.originalFiles.clear();

    const defaults: Record<string, string> = {
      'src/math_utils.py': `def calculate_discount(price: float, discount_percent: float) -> float:
    """Calculates discounted price."""
    if price < 0 or discount_percent < 0 or discount_percent > 100:
        raise ValueError("Invalid parameters")
    return price * (1 - (discount_percent / 100))

def apply_tax(amount: float, tax_rate: float = 0.20) -> float:
    """Applies tax rate to amount."""
    return round(amount * (1 + tax_rate), 2)
`,
      'tests/test_math_utils.py': `import pytest
from src.math_utils import calculate_discount, apply_tax

def test_calculate_discount():
    assert calculate_discount(100.0, 20.0) == 80.0
    assert calculate_discount(50.0, 0.0) == 50.0

def test_calculate_discount_invalid():
    with pytest.raises(ValueError):
        calculate_discount(-10.0, 20.0)

def test_apply_tax():
    assert apply_tax(100.0, 0.20) == 120.0
`,
      'src/user_service.py': `import re
from typing import Optional, Dict

class UserService:
    def __init__(self):
        self.users: Dict[str, dict] = {}

    def register(self, email: str, name: str) -> dict:
        if not re.match(r"^[^@]+@[^@]+\\.[^@]+$", email):
            raise ValueError("Invalid email address")
        if email in self.users:
            raise ValueError("User already registered")
        user = {"email": email, "name": name, "status": "active"}
        self.users[email] = user
        return user

    def get_by_email(self, email: str) -> Optional[dict]:
        return self.users.get(email)
`,
      'tests/test_user_service.py': `import pytest
from src.user_service import UserService

def test_register_success():
    service = UserService()
    user = service.register("alex@example.com", "Alex")
    assert user["email"] == "alex@example.com"
    assert user["status"] == "active"

def test_register_duplicate():
    service = UserService()
    service.register("alex@example.com", "Alex")
    with pytest.raises(ValueError, match="already registered"):
        service.register("alex@example.com", "Alex 2")
`,
      'README.md': `# Demo Project
Autonomous multi-agent verified software repository.
Managed by agentTeam (Manager, Developer, Tester, Reviewer).
`
    };

    for (const [path, content] of Object.entries(defaults)) {
      this.files.set(path, content);
      this.originalFiles.set(path, content);
    }
  }

  private isSafePath(filePath: string): { safe: boolean; error?: string } {
    const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');

    for (const pFile of this.PROTECTED_FILES) {
      if (normalized === pFile || normalized.endsWith('/' + pFile)) {
        return { safe: false, error: `Access to protected file forbidden: ${filePath}` };
      }
    }

    for (const pDir of this.PROTECTED_DIRS) {
      if (normalized.startsWith(pDir + '/') || normalized === pDir || normalized.includes('/' + pDir + '/')) {
        return { safe: false, error: `Access to protected directory forbidden: ${filePath}` };
      }
    }

    if (normalized.includes('..')) {
      return { safe: false, error: 'Path traversal forbidden' };
    }

    return { safe: true };
  }

  public readFile(filePath: string): string {
    const check = this.isSafePath(filePath);
    if (!check.safe) return `ERROR: ${check.error}`;

    const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!this.files.has(normalized)) {
      return `ERROR: File does not exist: ${filePath}`;
    }

    return this.files.get(normalized)!;
  }

  public writeFile(filePath: string, content: string): string {
    const check = this.isSafePath(filePath);
    if (!check.safe) return `ERROR: ${check.error}`;

    const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (this.files.has(normalized)) {
      return `ERROR: ${filePath} already exists. Use patch_file instead.`;
    }

    this.files.set(normalized, content);
    return `CREATED: ${filePath}`;
  }

  public patchFile(filePath: string, oldText: string, newText: string): string {
    const check = this.isSafePath(filePath);
    if (!check.safe) return `ERROR: ${check.error}`;

    const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!this.files.has(normalized)) {
      return `ERROR: File does not exist: ${filePath}`;
    }

    const current = this.files.get(normalized)!;
    const count = (current.match(new RegExp(this.escapeRegExp(oldText), 'g')) || []).length;

    if (count === 0) {
      return `ERROR: Target text not found in ${filePath}`;
    }

    if (count > 1) {
      return `ERROR: Target text appears ${count} times. Patch must match exactly one block.`;
    }

    const updated = current.replace(oldText, newText);
    this.files.set(normalized, updated);
    return `PATCHED: ${filePath}`;
  }

  private escapeRegExp(string: string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  public runCommand(command: string): string {
    this.commandLogs.push(command);
    const cmd = command.trim();

    // Simulated safe execution for pytest, npm test, lint, etc.
    if (cmd.startsWith('pytest') || cmd.startsWith('python -m pytest')) {
      return this.simulatePytest(cmd);
    }

    if (cmd.startsWith('git status')) {
      return this.gitStatus();
    }

    if (cmd.startsWith('git diff')) {
      return this.gitDiff();
    }

    if (cmd.startsWith('ruff') || cmd.startsWith('flake8')) {
      return `EXIT CODE: 0\nAll checks passed! No lint errors found.`;
    }

    if (cmd.startsWith('mypy')) {
      return `EXIT CODE: 0\nSuccess: no issues found in source files.`;
    }

    if (cmd.startsWith('python') || cmd.startsWith('python3')) {
      return `EXIT CODE: 0\nExecution completed successfully.`;
    }

    return `EXIT CODE: 0\nCommand executed: ${cmd}\nOutput: OK`;
  }

  private simulatePytest(cmd: string): string {
    // Check if tests pass based on file contents
    const testFiles = Array.from(this.files.keys()).filter(k => k.startsWith('tests/') || k.includes('test_'));
    let totalTests = Math.max(3, testFiles.length * 2);
    let passedTests = totalTests;
    let failedTests = 0;
    let failureDetails = '';

    // Check for obvious syntax issues or placeholder errors
    for (const [path, content] of this.files.entries()) {
      if (content.includes('raise NotImplementedError') || content.includes('TODO_FAIL')) {
        failedTests += 1;
        passedTests -= 1;
        failureDetails += `\nFAILED ${path}::test_feature - NotImplementedError: Missing feature implementation`;
      }
    }

    if (failedTests > 0) {
      return `EXIT CODE: 1
============================= test session starts ==============================
rootdir: /workspace
collected ${totalTests} items

${failureDetails}

======================== ${failedTests} failed, ${passedTests} passed in 0.18s =========================`;
    }

    return `EXIT CODE: 0
============================= test session starts ==============================
platform linux -- Python 3.11.8, pytest-8.1.1
rootdir: /workspace
collected ${totalTests} items

${testFiles.map(t => `${t} .`).join('\n')}

============================== ${totalTests} passed in 0.12s ==============================`;
  }

  public gitStatus(): string {
    const changes: string[] = [];
    for (const [path, content] of this.files.entries()) {
      if (!this.originalFiles.has(path)) {
        changes.push(`?? ${path}`);
      } else if (this.originalFiles.get(path) !== content) {
        changes.push(` M ${path}`);
      }
    }
    return changes.length > 0 ? changes.join('\n') : 'nothing to commit, working tree clean';
  }

  public gitDiff(): string {
    const diffs: string[] = [];
    for (const [path, content] of this.files.entries()) {
      if (!this.originalFiles.has(path)) {
        diffs.push(`+++ b/${path} (new file, ${content.split('\n').length} lines)`);
      } else if (this.originalFiles.get(path) !== content) {
        const origLines = this.originalFiles.get(path)!.split('\n').length;
        const newLines = content.split('\n').length;
        diffs.push(` M ${path} | ${Math.abs(newLines - origLines) + 2} +/-\n--- a/${path}\n+++ b/${path}`);
      }
    }
    return diffs.length > 0 ? diffs.join('\n\n') : '';
  }

  public getFiles(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [path, content] of this.files.entries()) {
      result[path] = content;
    }
    return result;
  }

  public setFile(path: string, content: string) {
    this.files.set(path, content);
  }

  public deleteFile(path: string) {
    this.files.delete(path);
  }
}

export const workspace = new VirtualWorkspace();
