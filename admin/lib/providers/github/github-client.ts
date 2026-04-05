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

  /**
   * Fetch a JSON file and return both the parsed data and the file's SHA.
   * The SHA is required by the GitHub API when updating an existing file.
   */
  async function fetchJsonWithSha<T>(path: string): Promise<{ data: T; sha: string }> {
    const file = await get<GitHubFileContent>(path);
    const decoded = Buffer.from(file.content, 'base64').toString('utf-8');
    return { data: JSON.parse(decoded) as T, sha: file.sha };
  }

  /**
   * Create or update a JSON file in the repo.
   * sha must be provided (from fetchJsonWithSha) when updating an existing file.
   */
  async function putJson(path: string, data: unknown, sha: string, message: string): Promise<void> {
    const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
    const url     = `${baseUrl}/contents/${path}`;
    const res     = await fetch(url, {
      method:  'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message, content, sha }),
    });
    if (!res.ok) {
      throw new ProviderError(res.status, `GitHub API error ${res.status} updating: ${path}`);
    }
  }

  /**
   * Fetch a raw binary asset (e.g. an image).
   * Uses the vnd.github.v3.raw media type to get bytes directly,
   * avoiding the base64-encoded Contents API response (which is unreliable
   * for large files and adds unnecessary encoding overhead).
   */
  async function fetchBinary(path: string): Promise<Buffer> {
    const url = `${baseUrl}/contents/${path}`;
    const res = await fetch(url, {
      headers: { ...headers, Accept: 'application/vnd.github.v3.raw' },
    });
    if (res.status === 404) {
      const { NotFoundError } = await import('@/lib/types');
      throw new NotFoundError(`Not found in repo: ${path}`);
    }
    if (!res.ok) {
      throw new ProviderError(res.status, `GitHub API error ${res.status} for path: ${path}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  /**
   * Trigger a GitHub Actions workflow_dispatch event.
   * inputs values must all be strings (GitHub Actions limitation).
   */
  async function dispatchWorkflow(
    workflowFile: string,
    ref:          string,
    inputs:       Record<string, string>,
  ): Promise<void> {
    const url = `${baseUrl}/actions/workflows/${workflowFile}/dispatches`;
    const res = await fetch(url, {
      method:  'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ref, inputs }),
    });
    // GitHub returns 204 No Content on success
    if (!res.ok && res.status !== 204) {
      const body = await res.text().catch(() => '(unreadable)');
      throw new ProviderError(res.status, `workflow_dispatch failed (${res.status}) for ${workflowFile}: ${body}`);
    }
  }

  return { listDirectory, fetchJson, fetchJsonWithSha, putJson, fetchBinary, dispatchWorkflow };
}

export type GitHubClient = ReturnType<typeof makeGitHubClient>;
