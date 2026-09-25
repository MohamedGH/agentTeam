import { GitHubConfig, GitHubUser } from './types';

export class GitHubApiError extends Error {
  public status: number;
  public responseBody?: any;

  constructor(message: string, status: number, responseBody?: any) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.responseBody = responseBody;
  }
}

export type FetchFunction = typeof fetch;

export class GitHubClient {
  private token: string;
  private owner?: string;
  private baseUrl: string;
  private fetchFn: FetchFunction;
  private cachedUser: GitHubUser | null = null;

  constructor(config?: GitHubConfig, fetchFn?: FetchFunction) {
    this.token = (config?.token ?? process.env.GITHUB_TOKEN ?? '').trim();
    this.owner = (config?.owner ?? process.env.GITHUB_OWNER ?? '').trim() || undefined;
    this.baseUrl = (config?.baseUrl ?? 'https://api.github.com').replace(/\/+$/, '');
    this.fetchFn = fetchFn ?? ((...args: [any, any?]) => globalThis.fetch(...args));
  }

  public isConfigured(): boolean {
    return Boolean(this.token && this.token.length > 0);
  }

  public setToken(token: string, owner?: string): void {
    this.token = (token || '').trim();
    if (owner !== undefined) {
      this.owner = owner.trim() || undefined;
    }
    this.cachedUser = null;
  }

  public getToken(): string {
    return this.token;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Request helper targeting GitHub REST API
   */
  public async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.isConfigured()) {
      throw new GitHubApiError('GITHUB_TOKEN is not configured', 401);
    }

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${this.baseUrl}${cleanEndpoint}`;

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${this.token}`,
      'User-Agent': 'agentTeam-GitHubClient/1.0.0',
      ...(options.headers as Record<string, string> || {}),
    };

    if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await this.fetchFn(url, {
      ...options,
      headers,
    });

    if (res.status === 204) {
      return {} as T;
    }

    let data: any = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      const message =
        data?.message ||
        `GitHub API error (${res.status} ${res.statusText}) on ${options.method || 'GET'} ${cleanEndpoint}`;
      throw new GitHubApiError(message, res.status, data);
    }

    return data as T;
  }

  /**
   * Fetch authenticated user info
   */
  public async getAuthenticatedUser(): Promise<GitHubUser> {
    if (this.cachedUser) {
      return this.cachedUser;
    }
    const user = await this.request<GitHubUser>('/user');
    this.cachedUser = user;
    return user;
  }

  /**
   * Resolve repository owner:
   * 1. explicit parameter if provided
   * 2. configured GITHUB_OWNER environment variable
   * 3. authenticated user login
   */
  public async resolveOwner(preferredOwner?: string): Promise<string> {
    if (preferredOwner && preferredOwner.trim().length > 0) {
      return preferredOwner.trim();
    }
    if (this.owner) {
      return this.owner;
    }
    const user = await this.getAuthenticatedUser();
    return user.login;
  }

  /**
   * Parse "owner/repo" or "repo" into separate components
   */
  public async parseRepoPath(repoString: string): Promise<{ owner: string; repo: string }> {
    const trimmed = repoString.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
    if (trimmed.includes('/')) {
      const [owner, ...repoParts] = trimmed.split('/');
      return { owner, repo: repoParts.join('/') };
    }
    const owner = await this.resolveOwner();
    return { owner, repo: trimmed };
  }
}
