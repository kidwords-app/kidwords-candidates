import type { AssetRepository } from '@/lib/types';
import { makeGitHubClient, type GitHubConfig } from './github-client';

interface AssetConfig {
  candidatesToken: string;
  publicToken:     string;
  owner:           string;
  candidatesRepo:  string;
  publicRepo:      string;
}

export class GitHubAssetRepository implements AssetRepository {
  private readonly candidatesGh: ReturnType<typeof makeGitHubClient>;
  private readonly publicGh:     ReturnType<typeof makeGitHubClient>;

  constructor(config: AssetConfig) {
    this.candidatesGh = makeGitHubClient({
      token: config.candidatesToken,
      owner: config.owner,
      repo:  config.candidatesRepo,
    });
    this.publicGh = makeGitHubClient({
      token: config.publicToken,
      owner: config.owner,
      repo:  config.publicRepo,
    });
  }

  /** Read a raw image from candidates/rounds/{roundId}/assets/{wordId}/{imageId}.png */
  async getImageAsset(roundId: string, wordId: string, imageId: string): Promise<Buffer> {
    const path = `candidates/rounds/${roundId}/assets/${wordId}/${imageId}.png`;
    return this.candidatesGh.fetchBinary(path);
  }

  /**
   * Copy a selected image into the public repo at public/cartoons/{wordId}.png.
   * Returns the public path where the asset now lives.
   */
  async putPublishedAsset(wordId: string, _imageId: string, data: Buffer): Promise<string> {
    const destPath = `public/cartoons/${wordId}.png`;

    // Try to get the existing file's SHA (required for update; absent for create)
    let sha: string | undefined;
    try {
      const existing = await this.publicGh.fetchBinary(destPath);
      // If we get here the file exists — we need its sha via a separate metadata fetch
      void existing; // content not needed, just checking existence
      const { GitHubFileContent } = {} as any; // placeholder — see note below
      void GitHubFileContent;
    } catch {
      // File doesn't exist yet — sha stays undefined, GitHub treats this as a create
    }

    const content = data.toString('base64');
    const url = `https://api.github.com/repos/${this.publicGh}/contents/${destPath}`;
    // Note: putJson handles create vs update based on sha presence.
    // For binary files we call the GitHub API directly rather than via putJson
    // because putJson assumes JSON content. This is the one place we bypass
    // the client helper intentionally — the binary path is simpler here.
    void content; void url; void sha;

    // TODO: implement binary PUT to public repo when publish workflow is built.
    // For now the publish workflow (GitHub Actions) handles the copy directly,
    // so this path is not called in production yet.
    throw new Error('GitHubAssetRepository.putPublishedAsset: delegated to publish workflow');
  }
}
