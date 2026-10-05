import { GitHubClient, GitHubApiError } from './githubClient';
import { CreateRepoOptions, GitHubRepoDetails } from './types';
import { validateRepoIdentifier } from './githubGitOperations';

const ALLOWED_REPOSITORIES = ['MohamedGH/agentTeam'];

export class GitHubRepository {
  private client: GitHubClient;

  constructor(client: GitHubClient) {
    this.client = client;
  }

  /**
   * Check if a GitHub repository exists
   */
  public async checkRepositoryExists(owner: string, repo: string): Promise<boolean> {
    validateRepoIdentifier(owner, 'Owner');
    validateRepoIdentifier(repo, 'Repository');
    try {
      await this.client.request<GitHubRepoDetails>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
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
    validateRepoIdentifier(owner, 'Owner');
    validateRepoIdentifier(repo, 'Repository');
    try {
      return await this.client.request<GitHubRepoDetails>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
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
    validateRepoIdentifier(options.name, 'Repository');
    const user = await this.client.getAuthenticatedUser();
    const targetOwner = options.owner || user.login;
    validateRepoIdentifier(targetOwner, 'Owner');

    const targetSlug = `${targetOwner.trim()}/${options.name.trim()}`;
    if (!ALLOWED_REPOSITORIES.includes(targetSlug)) {
      throw new Error(
        `Repository creation forbidden: "${targetSlug}" is not in the authorized repository allowlist (${ALLOWED_REPOSITORIES.join(', ')})`
      );
    }

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

    const endpoint = isUserRepo ? '/user/repos' : `/orgs/${encodeURIComponent(targetOwner)}/repos`;

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
    validateRepoIdentifier(owner, 'Owner');
    validateRepoIdentifier(repo, 'Repository');

    const targetSlug = `${owner.trim()}/${repo.trim()}`;
    if (!ALLOWED_REPOSITORIES.includes(targetSlug)) {
      throw new Error(
        `Invalid repository: "${targetSlug}" is not in the authorized repository allowlist (${ALLOWED_REPOSITORIES.join(', ')})`
      );
    }

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
