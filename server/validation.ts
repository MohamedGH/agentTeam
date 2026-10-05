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

/**
 * Strictly validates and normalizes a repository reference against the server-side allowlist.
 * Supports standard slug ("MohamedGH/agentTeam"), HTTPS URLs, and SSH URLs,
 * while blocking malformed strings, path traversal, URL redirection tricks, and unauthorized repositories.
 */
export function validateAllowedRepository(
  input: unknown,
  defaultRepo: string = 'MohamedGH/agentTeam'
): { repository: string; owner: string; repo: string } {
  const raw = input === undefined || input === null || input === '' ? defaultRepo : input;
  if (typeof raw !== 'string') {
    throw new ValidationError('Invalid repository: must be a string', 400);
  }

  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 256 || trimmed.includes('\0')) {
    throw new ValidationError('Invalid repository format', 400);
  }

  // Block query strings, fragments, backslashes, or traversal sequences in raw input
  if (/[?#\\]|\.\./.test(trimmed)) {
    throw new ValidationError(`Invalid repository "${trimmed}": contains disallowed URL or traversal characters`, 400);
  }

  // If input looks like a URL or SSH spec, ensure it strictly targets github.com
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    if (!/^https?:\/\/github\.com\//i.test(trimmed) && !/^ssh:\/\/git@github\.com\//i.test(trimmed)) {
      throw new ValidationError(`Unauthorized repository host in "${trimmed}"`, 403);
    }
  } else if (trimmed.includes('@') || trimmed.includes(':')) {
    if (!/^git@github\.com:/i.test(trimmed)) {
      throw new ValidationError(`Unauthorized SSH repository specification "${trimmed}"`, 403);
    }
  }

  const normalized = normalizeRepoIdentifier(trimmed);
  const parts = normalized.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new ValidationError(`Invalid repository format "${trimmed}" (expected owner/repo)`, 400);
  }

  const [owner, repo] = parts;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new ValidationError(`Invalid repository owner or name in "${trimmed}"`, 400);
  }

  const exactSlug = `${owner}/${repo}`;
  if (!ALLOWED_REPOSITORIES.includes(exactSlug)) {
    throw new ValidationError(
      `Invalid repository: "${exactSlug}" is not in the authorized repository allowlist (${ALLOWED_REPOSITORIES.join(', ')})`,
      403
    );
  }

  return { repository: exactSlug, owner, repo };
}

export function isRepositoryAllowed(input: unknown): boolean {
  try {
    validateAllowedRepository(input);
    return true;
  } catch {
    return false;
  }
}

export function validateSafeId(input: unknown, label: string = 'ID', maxLen: number = 128): string {
  if (typeof input !== 'string') {
    throw new ValidationError(`${label} is required and must be a string`, 400);
  }
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > maxLen) {
    throw new ValidationError(`${label} must be between 1 and ${maxLen} characters`, 400);
  }
  if (trimmed.includes('..') || trimmed.includes('\0') || !/^[a-zA-Z0-9_.:/-]+$/.test(trimmed)) {
    throw new ValidationError(`${label} contains disallowed characters`, 400);
  }
  return trimmed;
}

export function validateSafePrompt(input: unknown, label: string = 'Prompt', maxLen: number = 50000): string {
  if (typeof input !== 'string') {
    throw new ValidationError(`${label} is required and must be a string`, 400);
  }
  const trimmed = input.trim();
  if (!trimmed) {
    throw new ValidationError(`${label} cannot be empty`, 400);
  }
  if (trimmed.length > maxLen) {
    throw new ValidationError(`${label} exceeds maximum length of ${maxLen} characters`, 400);
  }
  if (trimmed.includes('\0')) {
    throw new ValidationError(`${label} contains invalid null bytes`, 400);
  }
  return trimmed;
}

export function validateSafeBranch(input: unknown, defaultBranch: string = 'main'): string {
  const raw = input === undefined || input === null || input === '' ? defaultBranch : input;
  if (typeof raw !== 'string' || raw.trim().length > 128) {
    throw new ValidationError('Invalid branch name', 400);
  }
  const trimmed = raw.trim();
  try {
    validateBranchName(trimmed);
  } catch (err: any) {
    throw new ValidationError(err.message || 'Invalid branch name', 400);
  }
  return trimmed;
}

export function validatePagination(input: unknown, defaultSize: number = 50, maxSize: number = 200): number {
  if (input === undefined || input === null || input === '') return defaultSize;
  const parsed = typeof input === 'number' ? input : parseInt(String(input), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new ValidationError('Invalid pagination parameter: must be a positive integer', 400);
  }
  if (parsed > maxSize) {
    return maxSize;
  }
  return Math.floor(parsed);
}

export function validateOptionalString(
  input: unknown,
  label: string,
  maxLen: number = 256
): string | undefined {
  if (input === undefined || input === null || input === '') return undefined;
  if (typeof input !== 'string') {
    throw new ValidationError(`${label} must be a string`, 400);
  }
  const trimmed = input.trim();
  if (trimmed.length > maxLen || trimmed.includes('\0')) {
    throw new ValidationError(`${label} exceeds maximum length or contains invalid characters`, 400);
  }
  return trimmed;
}
