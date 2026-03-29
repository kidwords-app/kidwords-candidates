import type { AssetRepository } from '@/lib/types';
import { NotFoundError } from '@/lib/types';

/**
 * In-memory AssetRepository for tests and local dev.
 * Returns synthetic buffers so image handling can be tested
 * without real image files or S3/GitHub access.
 */
export class MockAssetRepository implements AssetRepository {
  async getImageAsset(assetPath: string): Promise<Buffer> {
    if (!assetPath) {
      throw new NotFoundError(`Asset not found: ${assetPath}`);
    }
    return Buffer.from(`mock-image:${assetPath}`);
  }

  async putPublishedAsset(wordId: string, imageId: string, _data: Buffer): Promise<string> {
    return `https://mock-cdn.kidwords.app/cartoons/${wordId}/${imageId}.png`;
  }
}
