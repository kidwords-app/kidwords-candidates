import { ProviderError } from '@/lib/types';

export interface GitHubConfig {
  token: string;
  owner: string;
  repo:  string;
}

/** GitHub Contents API item shape (directory listing entry). */
export interface GitHubContentItem {
  type:         'file' | 'dir' | 'symlink' | 'submodule';
  name:         string;
  path:         string;
  sha:          string;
  size:         number;
  download_url: string | null;
}

/** GitHub Contents API file shape (single file). */
export interface GitHubFileContent {
  type:     'file';
  name:     string;
  path:     string;
  sha:      string;
  content:  string;   // base64-encoded
  encoding: 'base64';
}

export function makeGitHubClient(config: GitHubConfig) {
  const baseUrl = `https://api.github.com/repos/${config.owner}/${config.repo}`;
  const headers = {
    Authorization: `Bearer ${config.token}`,
    Accept:        'application/vnd.github.v3+json',
    'User-Agent':  'kidwords-admin',
  };

  async function get<T>(path: string): Promise<T> {
    const url = `${baseUrl}/contents/${path}`;
    const res = await fetch(url, { headers });

    if (res.status === 404) {
      const { ProviderError: _PE, NotFoundError } = await import('@/lib/types');
      throw new NotFoundError(`Not found in repo: ${path}`);
    }
    if (!res.ok) {
      throw new ProviderError(res.status, `GitHub API error ${res.status} for path: ${path}`);
    }
    return res.json() as Promise<T>;
  }

  /** List directory contents. Returns only file/dir items. */
  async function listDirectory(path: string): Promise<GitHubContentItem[]> {
    return get<GitHubContentItem[]>(path);
  }

  /** Fetch a JSON file and parse it. GitHub encodes content as base64. */
  async function fetchJson<T>(path: string): Promise<T> {
    const file = await get<GitHubFileContent>(path);
    const decoded = Buffer.from(file.content, 'base64').toString('utf-8');
    return JSON.parse(decoded) as T;
  }

  return { listDirectory, fetchJson };
}

export type GitHubClient = ReturnType<typeof makeGitHubClient>;
