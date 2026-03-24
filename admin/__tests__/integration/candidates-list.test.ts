import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockCandidateRepository } from '@/lib/providers/mock/MockCandidateRepository';
import { MOCK_WORDS } from '@/lib/providers/mock/mock-data';

// Inject mock provider before the route module loads it
vi.mock('@/lib/providers', () => ({
  candidateRepo: new MockCandidateRepository(),
}));

// Import after mock is in place
const { GET } = await import('@/app/api/admin/candidates/route');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(queryString = '') {
  return new Request(`http://localhost/api/admin/candidates${queryString}`);
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/admin/candidates', () => {
  it('returns all words when no filters are provided', async () => {
    const res = await GET(makeRequest() as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.words).toHaveLength(MOCK_WORDS.length);
  });

  it('filters by roundId', async () => {
    const res = await GET(makeRequest('?roundId=2026-03-03') as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    const expected = MOCK_WORDS.filter(w => w.roundId === '2026-03-03');
    expect(body.words).toHaveLength(expected.length);
    expect(body.words.every((w: any) => w.roundId === '2026-03-03')).toBe(true);
  });

  it('filters by status', async () => {
    const res = await GET(makeRequest('?status=in_review') as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.words.every((w: any) => w.status === 'in_review')).toBe(true);
  });

  it('filters by both roundId and status', async () => {
    const res = await GET(makeRequest('?roundId=2026-03-03&status=pending') as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    const expected = MOCK_WORDS.filter(w => w.roundId === '2026-03-03' && w.status === 'pending');
    expect(body.words).toHaveLength(expected.length);
  });

  it('returns an empty array when no words match the filter', async () => {
    const res = await GET(makeRequest('?roundId=9999-99-99') as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.words).toHaveLength(0);
  });

  it('returns 400 for an invalid status value', async () => {
    const res = await GET(makeRequest('?status=invalid_status') as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid status/);
  });

  it('response includes required WordCandidate fields', async () => {
    const res = await GET(makeRequest('?roundId=2026-03-03') as any);
    const body = await res.json();
    const word = body.words[0];
    expect(word).toHaveProperty('wordId');
    expect(word).toHaveProperty('word');
    expect(word).toHaveProperty('roundId');
    expect(word).toHaveProperty('status');
    expect(word).toHaveProperty('images');
    expect(word).toHaveProperty('levels');
    expect(word).toHaveProperty('selected');
  });
});
