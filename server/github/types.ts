/**
 * Types and interfaces for GitHub REST API client and Git automation
 */

export interface GitHubConfig {
  token?: string;
  owner?: string;
  baseUrl?: string;
}

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url?: string;
  html_url?: string;
  name?: string;
  email?: string;
}

export interface GitHubRepoDetails {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    id: number;
  };
  private: boolean;
  html_url: string;
  clone_url: string;
  default_branch: string;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateRepoOptions {
  name: string;
  owner?: string;
  private?: boolean;
  description?: string;
  autoInit?: boolean;
}

export interface CreatePROptions {
  title: string;
  head: string; // branch containing changes
  base: string; // branch to merge into, e.g. "main"
  body?: string;
  draft?: boolean;
}

export interface PullRequestDetails {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: 'open' | 'closed' | string;
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  merged?: boolean;
  draft?: boolean;
  body?: string;
}

export interface GitStatusResult {
  success?: boolean;
  error?: string;
  hasChanges: boolean;
  modifiedFiles: string[];
  addedFiles: string[];
  deletedFiles: string[];
  untrackedFiles: string[];
  currentBranch?: string;
  rawStatus?: string;
}

export interface GitCommitResult {
  committed: boolean;
  commitSha: string;
  commitMessage: string;
  filesCommitted: string[];
}

export interface GitPushResult {
  pushed: boolean;
  branch: string;
  remote: string;
  commitSha: string;
  commitUrl: string;
}

export interface GitWorkflowOptions {
  repository: string; // "owner/repo" or "repo"
  branch?: string;
  baseBranch?: string;
  taskPrompt: string;
  sessionId?: string;
  sessionStatus?: string;
  executionStatus?: string;
  realExecution?: boolean;
  testsPassed?: boolean;
  reviewExecuted?: boolean;
  reviewApproved?: boolean;
  createRepository?: boolean;
  repositoryName?: string;
  private?: boolean;
  git?: {
    commit?: boolean;
    push?: boolean;
    createPullRequest?: boolean;
  };
  commitAndPush?: boolean;
  commitPushAndCreatePR?: boolean;
  testCommand?: string;
  workingDirectory?: string;
  filesToCommit?: Record<string, string>;
  commitMessage?: string;
}

export interface GitHubWorkflowResult {
  success: boolean;
  sessionId?: string;
  repository: string;
  branch: string;
  commitSha?: string;
  commitUrl?: string;
  pullRequestUrl?: string;
  testsPassed: boolean;
  error?: string;
  git?: {
    committed: boolean;
    pushed: boolean;
    branch: string;
    commitSha?: string;
    commitUrl?: string;
    pullRequestUrl?: string;
    filesChanged?: string[];
  };
}
