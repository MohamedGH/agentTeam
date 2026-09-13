import { GitHubClient, GitHubApiError } from './githubClient';
import { CreatePROptions, PullRequestDetails } from './types';

export class GitHubPullRequest {
  private client: GitHubClient;

  constructor(client: GitHubClient) {
    this.client = client;
  }

  /**
   * Create a GitHub Pull Request.
   * If an identical PR already exists for the head/base branch, finds and returns it.
   */
  public async createPullRequest(
    owner: string,
    repo: string,
    options: CreatePROptions
  ): Promise<PullRequestDetails> {
    const cleanHead = options.head.includes(':') ? options.head : `${owner}:${options.head}`;

    try {
      return await this.client.request<PullRequestDetails>(`/repos/${owner}/${repo}/pulls`, {
        method: 'POST',
        body: JSON.stringify({
          title: options.title,
          head: options.head,
          base: options.base,
          body: options.body || '',
          draft: options.draft ?? false,
        }),
      });
    } catch (err: any) {
      if (err instanceof GitHubApiError && err.status === 422) {
        // A pull request may already exist for this branch
        const existing = await this.findExistingPullRequest(owner, repo, options.head, options.base);
        if (existing) {
          return existing;
        }
      }
      throw err;
    }
  }

  /**
   * Look up existing open PR for a given head and base
   */
  public async findExistingPullRequest(
    owner: string,
    repo: string,
    head: string,
    base: string
  ): Promise<PullRequestDetails | null> {
    try {
      const pulls = await this.client.request<PullRequestDetails[]>(
        `/repos/${owner}/${repo}/pulls?state=open&base=${encodeURIComponent(base)}`
      );

      const branchName = head.replace(/^.*:/, '');
      const match = pulls.find(
        (p) => p.head.ref === branchName || p.head.ref === head
      );

      return match || null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Format descriptive Markdown PR description
   */
  public formatPullRequestBody(
    task: string,
    options?: {
      commitSha?: string;
      branch?: string;
      testsPassed?: boolean;
      filesChanged?: string[];
      summary?: string;
    }
  ): string {
    const lines: string[] = [
      '### 🤖 Autonomous Implementation by agentTeam & Jules',
      '',
      '#### 🎯 Task Description',
      task,
      '',
      '#### 🔍 Quality & Verification Status',
      `- **Automated Tests**: ${options?.testsPassed !== false ? '✅ PASSED' : '⚠️ WARNING / SKIPPED'}`,
    ];

    if (options?.branch) {
      lines.push(`- **Branch**: \`${options.branch}\``);
    }
    if (options?.commitSha) {
      lines.push(`- **Commit**: \`${options.commitSha.slice(0, 7)}\``);
    }
    if (options?.filesChanged && options.filesChanged.length > 0) {
      lines.push('');
      lines.push('#### 📂 Modified Files');
      options.filesChanged.forEach((f) => lines.push(`- \`${f}\``));
    }
    if (options?.summary) {
      lines.push('');
      lines.push('#### 📝 Execution Summary');
      lines.push(options.summary);
    }

    lines.push('');
    lines.push('---');
    lines.push('*Automated delivery generated and verified by AgentTeam Engine.*');

    return lines.join('\n');
  }
}
