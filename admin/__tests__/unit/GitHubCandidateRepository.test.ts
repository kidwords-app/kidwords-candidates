import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubCandidateRepository } from '@/lib/providers/github/GitHubCandidateRepository';
import { NotFoundError, ProviderError } from '@/lib/types';
import type { WordCandidate } from '@/lib/types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const EMPATHY_WORD: WordCandidate = {
  wordId: 'empathy', word: 'empathy', partOfSpeech: 'noun', syllables: 3,
  tags: ['emotions'], roundId: '2026-03-03', status: 'in_review',
  images: [], levels: { preK: [], K: [], G1: [] },
  selected: {}, subPrompts: {},
  createdAt: '2026-03-03T00:00:00Z', updatedAt: '2026-03-03T00:00:00Z',
};

const RESILIENCE_WORD: WordCandidate = {
  ...EMPATHY_WORD, wordId: 'resilience', word: 'resilience', status: 'pending',
};

/** Encode a JSON object as base64, matching the GitHub Contents API format. */
function asGitHubFile(data: unknown, name: string) {
  const content = Buffer.from(JSON.stringify(data)).toString('base64');
  return { type: 'file', name, path: `candidates/rounds/2026-03-03/words/${name}`, sha: 'abc', size: 100, content, encoding: 'base64' };
}

function dirEntry(name: string, type: 'file' | 'dir' = 'file') {
  return { type, name, path: `candidates/rounds/${name}`, sha: 'abc', size: 0, download_url: null };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('GitHubCandidateRepository', () => {
  const config = { token: 'test-token', owner: 'kidwords-app', repo: 'kidwords-candidates' };
  let repo: GitHubCandidateRepository;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    repo = new GitHubCandidateRepository(config);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  // ── getWord ─────────────────────────────────────────────────────────────────

  describe('getWord', () => {
    it('fetches and parses a word JSON file from the correct path', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => asGitHubFile(EMPATHY_WORD, 'empathy.json'),
      });

      const word = await repo.getWord('2026-03-03', 'empathy');

      expect(word.wordId).toBe('empathy');
      expect(word.status).toBe('in_review');

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('candidates/rounds/2026-03-03/words/empathy.json');
    });

    it('throws NotFoundError when GitHub returns 404', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });

      await expect(repo.getWord('2026-03-03', 'nonexistent')).rejects.toThrow(NotFoundError);
    });

    it('throws ProviderError when GitHub returns 500', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(repo.getWord('2026-03-03', 'empathy')).rejects.toThrow(ProviderError);
    });

    it('includes Authorization header with Bearer token', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => asGitHubFile(EMPATHY_WORD, 'empathy.json'),
      });

      await repo.getWord('2026-03-03', 'empathy');

      const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-token');
    });
  });

  // ── listWords ───────────────────────────────────────────────────────────────

  describe('listWords', () => {
    it('lists words for a specific round', async () => {
      // First call: directory listing
      fetchMock.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => [
          dirEntry('empathy.json'),
          dirEntry('resilience.json'),
        ],
      });
      // Subsequent calls: each word file
      fetchMock.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => asGitHubFile(EMPATHY_WORD, 'empathy.json'),
      });
      fetchMock.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => asGitHubFile(RESILIENCE_WORD, 'resilience.json'),
      });

      const words = await repo.listWords({ roundId: '2026-03-03' });

      expect(words).toHaveLength(2);
      expect(words.map(w => w.wordId)).toEqual(expect.arrayContaining(['empathy', 'resilience']));
    });

    it('filters by status after fetching', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => [dirEntry('empathy.json'), dirEntry('resilience.json')],
      });
      fetchMock.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => asGitHubFile(EMPATHY_WORD, 'empathy.json'),
      });
      fetchMock.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => asGitHubFile(RESILIENCE_WORD, 'resilience.json'),
      });

      const words = await repo.listWords({ roundId: '2026-03-03', status: 'in_review' });

      expect(words).toHaveLength(1);
      expect(words[0].wordId).toBe('empathy');
    });

    it('fetches all rounds when no roundId is provided', async () => {
      // First call: rounds directory
      fetchMock.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => [dirEntry('2026-03-03', 'dir'), dirEntry('2026-03-01', 'dir')],
      });
      // For each round: directory listing (empty) to keep it simple
      fetchMock.mockResolvedValue({
        ok: true, status: 200,
        json: async () => [],
      });

      const words = await repo.listWords();

      expect(words).toHaveLength(0);
      // First call should be to the rounds directory
      const firstUrl = fetchMock.mock.calls[0][0] as string;
      expect(firstUrl).toContain('candidates/rounds');
      expect(firstUrl).not.toContain('/words');
    });

    it('ignores non-json files in the words directory', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => [
          dirEntry('empathy.json'),
          dirEntry('.gitkeep'),        // should be ignored
          dirEntry('README.md'),       // should be ignored
        ],
      });
      fetchMock.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => asGitHubFile(EMPATHY_WORD, 'empathy.json'),
      });

      const words = await repo.listWords({ roundId: '2026-03-03' });

      expect(words).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2); // listing + 1 word file
    });
  });

  // Write method behaviour is covered in GitHubCandidateRepository.write.test.ts
});
