import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubCandidateRepository } from '@/lib/providers/github/GitHubCandidateRepository';
import type { WordCandidate } from '@/lib/types';

const BASE_WORD: WordCandidate = {
  wordId: 'empathy', word: 'empathy', partOfSpeech: 'noun', syllables: 3,
  tags: ['emotions'], roundId: '2026-03-03', status: 'in_review',
  images: [], levels: { preK: [], K: [], G1: [] },
  selected: {}, subPrompts: {},
  createdAt: '2026-03-03T00:00:00Z', updatedAt: '2026-03-03T00:00:00Z',
};

function asGitHubFile(data: unknown) {
  return {
    type: 'file', name: 'empathy.json', path: 'candidates/rounds/2026-03-03/words/empathy.json',
    sha: 'file-sha-abc123', size: 100,
    content: Buffer.from(JSON.stringify(data)).toString('base64'),
    encoding: 'base64',
  };
}

describe('GitHubCandidateRepository — write methods', () => {
  const config = { token: 'test-token', owner: 'kidwords-app', repo: 'kidwords-candidates' };
  let repo:      GitHubCandidateRepository;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    repo      = new GitHubCandidateRepository(config);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  function mockReadThenWrite() {
    // First call: GET (read current file)
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => asGitHubFile(BASE_WORD),
    });
    // Second call: PUT (write updated file)
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
  }

  function getPutBody() {
    const putCall = fetchMock.mock.calls[1];
    const rawBody = putCall[1].body as string;
    const { content } = JSON.parse(rawBody);
    return JSON.parse(Buffer.from(content, 'base64').toString('utf-8')) as WordCandidate;
  }

  // ── saveSelections ───────────────────────────────────────────────────────────

  describe('saveSelections', () => {
    it('writes the selected imageId back to the file', async () => {
      mockReadThenWrite();
      await repo.saveSelections('2026-03-03', 'empathy', { imageId: 'img_xk72ms' });
      const written = getPutBody();
      expect(written.selected.imageId).toBe('img_xk72ms');
    });

    it('writes per-level field selections', async () => {
      mockReadThenWrite();
      await repo.saveSelections('2026-03-03', 'empathy', {
        levels: { preK: { definition: 1, example: 0, tryIt: 2 } },
      });
      const written = getPutBody();
      expect(written.selected.levels?.preK).toEqual({ definition: 1, example: 0, tryIt: 2 });
    });

    it('sends the current file SHA in the PUT request', async () => {
      mockReadThenWrite();
      await repo.saveSelections('2026-03-03', 'empathy', { imageId: 'img_1' });
      const putBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(putBody.sha).toBe('file-sha-abc123');
    });

    it('sets updatedAt to a current ISO string', async () => {
      mockReadThenWrite();
      const before = new Date().toISOString();
      await repo.saveSelections('2026-03-03', 'empathy', { imageId: 'img_1' });
      const written = getPutBody();
      expect(written.updatedAt >= before).toBe(true);
    });
  });

  // ── saveSubprompt ────────────────────────────────────────────────────────────

  describe('saveSubprompt', () => {
    it('saves an image sub-prompt', async () => {
      mockReadThenWrite();
      await repo.saveSubprompt('2026-03-03', 'empathy', { field: 'image', text: 'warmer colors' });
      expect(getPutBody().subPrompts.image).toBe('warmer colors');
    });

    it('saves a level sub-prompt', async () => {
      mockReadThenWrite();
      await repo.saveSubprompt('2026-03-03', 'empathy', { field: 'level', levelId: 'preK', text: 'simpler' });
      expect(getPutBody().subPrompts.levels?.preK).toBe('simpler');
    });
  });

  // ── setStatus ────────────────────────────────────────────────────────────────

  describe('setStatus', () => {
    it('writes the new status to the file', async () => {
      mockReadThenWrite();
      await repo.setStatus('2026-03-03', 'empathy', 'approved');
      expect(getPutBody().status).toBe('approved');
    });

    it('includes a descriptive commit message', async () => {
      mockReadThenWrite();
      await repo.setStatus('2026-03-03', 'empathy', 'approved');
      const putBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(putBody.message).toContain('approved');
      expect(putBody.message).toContain('empathy');
    });
  });
});
