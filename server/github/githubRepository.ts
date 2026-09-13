import { GitHubClient, GitHubApiError } from './githubClient';
import { CreateRepoOptions, GitHubRepoDetails } from './types';

export class GitHubRepository {
  private client: GitHubClient;

  constructor(client: GitHubClient) {
    this.client = client;
  }

  /**
   * Check if a GitHub repository exists
   */
  public async checkRepositoryExists(owner: string, repo: string): Promise<boolean> {
    try {
      await this.client.request<GitHubRepoDetails>(`/repos/${owner}/${repo}`);
      return true;
    } catch (err: any) {
      if (err instanceof GitHubApiError && err.status === 404) {
        return false;
      }
      throw err;
    }
  }

  /**
   * Get repository details
   */
  public async getRepository(owner: string, repo: string): Promise<GitHubRepoDetails | null> {
    try {
      return await this.client.request<GitHubRepoDetails>(`/repos/${owner}/${repo}`);
    } catch (err: any) {
      if (err instanceof GitHubApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Create a new repository on GitHub.
   * Never overwrites or deletes an existing repository.
   */
  public async createRepository(options: CreateRepoOptions): Promise<GitHubRepoDetails> {
    const user = await this.client.getAuthenticatedUser();
    const targetOwner = options.owner || user.login;
    const isUserRepo = targetOwner.toLowerCase() === user.login.toLowerCase();

    // Check if it already exists to prevent clobbering or duplicate error
    const exists = await this.checkRepositoryExists(targetOwner, options.name);
    if (exists) {
      const existing = await this.getRepository(targetOwner, options.name);
      if (existing) {
        return existing;
      }
    }

    const payload = {
      name: options.name,
      description: options.description || 'Repository managed by agentTeam & Jules',
      private: options.private ?? false,
      auto_init: options.autoInit ?? true,
    };

    const endpoint = isUserRepo ? '/user/repos' : `/orgs/${targetOwner}/repos`;

    return await this.client.request<GitHubRepoDetails>(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Ensure repository exists. If it doesn't and createRepository=true, creates it.
   */
  public async ensureRepository(options: {
    repository: string;
    createRepository?: boolean;
    private?: boolean;
    description?: string;
  }): Promise<GitHubRepoDetails> {
    const { owner, repo } = await this.client.parseRepoPath(options.repository);
    const existing = await this.getRepository(owner, repo);

    if (existing) {
      return existing;
    }

    if (!options.createRepository) {
      throw new Error(
        `Repository "${owner}/${repo}" does not exist on GitHub and createRepository was not set to true.`
      );
    }

    return await this.createRepository({
      name: repo,
      owner,
      private: options.private,
      description: options.description,
      autoInit: true,
    });
  }
}
