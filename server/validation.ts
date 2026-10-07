import { normalizeRepoIdentifier, validateBranchName } from './github/githubGitOperations';

export const ALLOWED_REPOSITORIES: readonly string[] = ['MohamedGH/agentTeam'];

export class ValidationError extends Error {
  public status: number;
  constructor(message: string, status: number = 400) {
    super(message);
    this.name = 'ValidationError';
    this.status = status;
  }
}

export interface RepositoryValidationResult {
  valid: boolean;
  normalized: string;
  repository: string;
  owner: string;
  repo: string;
  error?: string;
}

/**
 * Strictly validates and normalizes a repository reference against the server-side allowlist.
 * Supports standard slug ("MohamedGH/agentTeam"), HTTPS URLs, and SSH URLs,
 * while blocking malformed strings, path traversal, URL redirection tricks, and unauthorized repositories.
 */
export function validateAllowedRepository(
  input: unknown,
  defaultRepo: string = 'MohamedGH/agentTeam'
): RepositoryValidationResult {
  const raw = input === undefined || input === null || input === '' ? defaultRepo : input;
  if (typeof raw !== 'string') {
    return {
      valid: false,
      normalized: '',
      repository: '',
      owner: '',
      repo: '',
      error: 'Invalid repository: must be a string',
    };
  }

  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 256 || trimmed.includes('\0')) {
    return {
      valid: false,
      normalized: '',
      repository: '',
      owner: '',
      repo: '',
      error: 'Invalid repository format',
    };
  }

  // Block query strings, fragments, backslashes, or traversal sequences in raw input
  if (/[?#\\]|\.\./.test(trimmed)) {
    return {
      valid: false,
      normalized: '',
      repository: '',
      owner: '',
      repo: '',
      error: `Invalid repository "${trimmed}": contains disallowed URL or traversal characters`,
    };
  }

  // If input looks like a URL or SSH spec, ensure it strictly targets github.com
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    if (!/^https?:\/\/github\.com\//i.test(trimmed) && !/^ssh:\/\/git@github\.com\//i.test(trimmed)) {
      return {
        valid: false,
        normalized: '',
        repository: '',
        owner: '',
        repo: '',
        error: `Unauthorized repository host in "${trimmed}"`,
      };
    }
  } else if (trimmed.includes('@') || trimmed.includes(':')) {
    if (!/^git@github\.com:/i.test(trimmed)) {
      return {
        valid: false,
        normalized: '',
        repository: '',
        owner: '',
        repo: '',
        error: `Unauthorized SSH repository specification "${trimmed}"`,
      };
    }
  }

  const normalized = normalizeRepoIdentifier(trimmed);
  const parts = normalized.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return {
      valid: false,
      normalized: '',
      repository: '',
      owner: '',
      repo: '',
      error: `Invalid repository format "${trimmed}" (expected owner/repo)`,
    };
  }

  const [owner, repo] = parts;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    return {
      valid: false,
      normalized: '',
      repository: '',
      owner: '',
      repo: '',
      error: `Invalid repository owner or name in "${trimmed}"`,
    };
  }

  const exactSlug = `${owner}/${repo}`;
  if (!ALLOWED_REPOSITORIES.includes(exactSlug)) {
    return {
      valid: false,
      normalized: exactSlug,
      repository: exactSlug,
      owner,
      repo,
      error: `Invalid repository: "${exactSlug}" is not in the authorized repository allowlist (${ALLOWED_REPOSITORIES.join(', ')})`,
    };
  }

  return {
    valid: true,
    normalized: exactSlug,
    repository: exactSlug,
    owner,
    repo,
  };
}

export function isRepositoryAllowed(input: unknown): boolean {
  return validateAllowedRepository(input).valid;
}

export interface StringValidationResult {
  valid: boolean;
  normalized: string;
  value: string;
  error?: string;
}

export function validateSafeId(
  input: unknown,
  label: string = 'ID',
  maxLen: number = 128
): StringValidationResult {
  if (typeof input !== 'string') {
    return {
      valid: false,
      normalized: '',
      value: '',
      error: `${label} is required and must be a string`,
    };
  }
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > maxLen) {
    return {
      valid: false,
      normalized: '',
      value: '',
      error: `${label} must be between 1 and ${maxLen} characters`,
    };
  }
  if (trimmed.includes('..') || trimmed.includes('\0') || !/^[a-zA-Z0-9_.:/-]+$/.test(trimmed)) {
    return {
      valid: false,
      normalized: '',
      value: '',
      error: `${label} contains disallowed characters`,
    };
  }
  return {
    valid: true,
    normalized: trimmed,
    value: trimmed,
  };
}

export interface BranchValidationResult {
  valid: boolean;
  normalized: string;
  branch: string;
  error?: string;
}

export function validateGitBranch(
  input: unknown,
  defaultBranch: string = 'main'
): BranchValidationResult {
  const raw = input === undefined || input === null || input === '' ? defaultBranch : input;
  if (typeof raw !== 'string') {
    return {
      valid: false,
      normalized: '',
      branch: '',
      error: 'Invalid branch name: must be a string',
    };
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 128) {
    return {
      valid: false,
      normalized: '',
      branch: '',
      error: 'Invalid branch name length',
    };
  }
  try {
    validateBranchName(trimmed);
  } catch (err: any) {
    return {
      valid: false,
      normalized: '',
      branch: '',
      error: err.message || 'Invalid branch name',
    };
  }
  return {
    valid: true,
    normalized: trimmed,
    branch: trimmed,
  };
}

export const validateSafeBranch = validateGitBranch;

export interface TestCommandValidationResult {
  valid: boolean;
  normalized: string;
  command: string;
  error?: string;
}

/**
 * Validates that a testCommand matches an allowlist of safe test runner invocations
 * without shell metacharacters, command chaining, or inline eval flags (-e, -c, --eval).
 */
export function validateSafeTestCommand(input: unknown): TestCommandValidationResult {
  if (typeof input !== 'string') {
    return {
      valid: false,
      normalized: '',
      command: '',
      error: 'testCommand must be a string',
    };
  }
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 256 || trimmed.includes('\0')) {
    return {
      valid: false,
      normalized: '',
      command: '',
      error: 'testCommand must be between 1 and 256 characters',
    };
  }

  // Reject shell chaining, redirection, backticks, subshells, newlines
  if (/[;&|`$><\r\n\\]/.test(trimmed)) {
    return {
      valid: false,
      normalized: '',
      command: '',
      error: 'Unsafe testCommand: shell metacharacters or chaining operators are forbidden',
    };
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const executable = tokens[0];
  const args = tokens.slice(1);
  const allowedExecutables = new Set(['npm', 'npx', 'pnpm', 'yarn', 'pytest', 'vitest', 'jest', 'tsx', 'node', 'cargo', 'go']);

  if (!allowedExecutables.has(executable)) {
    return {
      valid: false,
      normalized: '',
      command: '',
      error: `Unsafe testCommand: executable "${executable}" is not in the allowed test runners`,
    };
  }

  // Disallow inline code execution flags
  const forbiddenFlags = new Set([
    '-e',
    '--eval',
    '-c',
    '-p',
    '--print',
    '--import',
    '--require',
    '-r',
    '--loader',
    '--experimental-loader',
    '--inspect',
    '--inspect-brk',
    '--input-type',
    '--conditions',
    '--prof',
    '--test-reporter',
  ]);
  for (const tok of args) {
    const flag = tok.split('=')[0];
    if (forbiddenFlags.has(flag) || flag.startsWith('--eval=') || flag.startsWith('--require=')) {
      return {
        valid: false,
        normalized: '',
        command: '',
        error: `Unsafe testCommand: inline code execution flag "${tok}" is forbidden`,
      };
    }
  }

  if ((executable === 'npm' || executable === 'yarn' || executable === 'pnpm') && args.length > 0) {
    const sub = args[0];
    if (sub === 'exec' || sub === 'dlx' || sub === 'config' || sub === 'publish' || sub === 'install' || sub === 'i' || sub === 'add') {
      return {
        valid: false,
        normalized: '',
        command: '',
        error: `Unsafe testCommand: subcommand "${sub}" is forbidden`,
      };
    }
  }

  if (executable === 'node' || executable === 'tsx') {
    for (const arg of args) {
      if (!arg.startsWith('-')) {
        if (arg.includes('..') || arg.startsWith('/') || /^[a-zA-Z]:/.test(arg)) {
          return {
            valid: false,
            normalized: '',
            command: '',
            error: `Unsafe testCommand: path traversal or absolute path "${arg}" is forbidden`,
          };
        }
      }
    }
  }

  return {
    valid: true,
    normalized: trimmed,
    command: trimmed,
  };
}

export interface TierValidationResult {
  valid: boolean;
  normalized: 'free' | 'tier_1' | 'tier_2' | 'tier_3';
  tier: 'free' | 'tier_1' | 'tier_2' | 'tier_3';
  error?: string;
}

export function validateTier(
  input: unknown,
  defaultTier: 'free' | 'tier_1' | 'tier_2' | 'tier_3' = 'tier_3'
): TierValidationResult {
  if (input === undefined || input === null || input === '') {
    return { valid: true, normalized: defaultTier, tier: defaultTier };
  }
  if (typeof input !== 'string') {
    return {
      valid: false,
      normalized: defaultTier,
      tier: defaultTier,
      error: 'Invalid tier parameter: must be a string',
    };
  }
  const trimmed = input.trim() as any;
  const allowed = new Set(['free', 'tier_1', 'tier_2', 'tier_3']);
  if (!allowed.has(trimmed)) {
    return {
      valid: false,
      normalized: defaultTier,
      tier: defaultTier,
      error: `Invalid tier "${trimmed}". Allowed values: free, tier_1, tier_2, tier_3`,
    };
  }
  return {
    valid: true,
    normalized: trimmed,
    tier: trimmed,
  };
}

export interface PaginationValidationResult {
  valid: boolean;
  value: number;
  error?: string;
}

export function validatePaginationLimit(
  input: unknown,
  defaultSize: number = 50,
  maxSize: number = 200
): PaginationValidationResult {
  if (input === undefined || input === null || input === '') {
    return { valid: true, value: defaultSize };
  }
  const parsed = typeof input === 'number' ? input : parseInt(String(input), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return {
      valid: false,
      value: defaultSize,
      error: 'Invalid pagination parameter: must be a positive integer',
    };
  }
  return {
    valid: true,
    value: Math.min(Math.floor(parsed), maxSize),
  };
}
