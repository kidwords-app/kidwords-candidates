import { describe, it, expect, vi } from 'vitest';
import { MockCandidateRepository } from '@/lib/providers/mock/MockCandidateRepository';

vi.mock('@/lib/providers', () => ({
  candidateRepo: new MockCandidateRepository(),
}));

const { GET } = await import('@/app/api/admin/candidates/[wordId]/route');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(wordId: string, queryString = '') {
  return {
    nextUrl: new URL(`http://localhost/api/admin/candidates/${wordId}${queryString}`),
  } as any;
}

function makeParams(wordId: string) {
  return Promise.resolve({ wordId });
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/admin/candidates/:wordId', () => {
  it('returns a word with all candidate data', async () => {
    const res = await GET(makeRequest('empathy', '?roundId=2026-03-03'), { params: makeParams('empathy') });
    expect(res.status).toBe(200);
    const word = await res.json();

    expect(word.wordId).toBe('empathy');
    expect(word.roundId).toBe('2026-03-03');
    expect(word.images.length).toBeGreaterThan(0);
    expect(word.levels.preK.length).toBeGreaterThan(0);
    expect(word.levels.K.length).toBeGreaterThan(0);
    expect(word.levels.G1.length).toBeGreaterThan(0);
  });

  it('returns level candidates with required fields', async () => {
    const res = await GET(makeRequest('empathy', '?roundId=2026-03-03'), { params: makeParams('empathy') });
    const word = await res.json();
    const candidate = word.levels.preK[0];

    expect(candidate).toHaveProperty('definition');
    expect(candidate).toHaveProperty('example');
    expect(candidate).toHaveProperty('tryIt');
    expect(candidate).toHaveProperty('model');
  });

  it('returns image candidates with required fields', async () => {
    const res = await GET(makeRequest('empathy', '?roundId=2026-03-03'), { params: makeParams('empathy') });
    const word = await res.json();
    const image = word.images[0];

    expect(image).toHaveProperty('imageId');
    expect(image).toHaveProperty('prompt');
    expect(image).toHaveProperty('model');
    expect(image).toHaveProperty('assetPath');
  });

  it('returns 400 when roundId is missing', async () => {
    const res = await GET(makeRequest('empathy'), { params: makeParams('empathy') });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/roundId/);
  });

  it('returns 404 for an unknown wordId', async () => {
    const res = await GET(
      makeRequest('nonexistent', '?roundId=2026-03-03'),
      { params: makeParams('nonexistent') },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 404 when roundId does not match the word', async () => {
    const res = await GET(
      makeRequest('empathy', '?roundId=2026-03-01'), // empathy is in 2026-03-03
      { params: makeParams('empathy') },
    );
    expect(res.status).toBe(404);
  });
});
