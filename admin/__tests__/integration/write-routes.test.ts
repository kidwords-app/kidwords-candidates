import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockCandidateRepository } from '@/lib/providers/mock/MockCandidateRepository';
import { MockWorkflowClient }      from '@/lib/providers/mock/MockWorkflowClient';

const mockRepo     = new MockCandidateRepository();
const mockWorkflow = new MockWorkflowClient();

vi.mock('@/lib/providers', () => ({
  candidateRepo:  mockRepo,
  workflowClient: mockWorkflow,
}));

// Import routes after mocks are in place
const { POST: postSelect }       = await import('@/app/api/admin/candidates/[wordId]/select/route');
const { POST: postSubprompt }    = await import('@/app/api/admin/candidates/[wordId]/subprompt/route');
const { POST: postApprove }      = await import('@/app/api/admin/candidates/[wordId]/approve/route');
const { POST: postRegenerate }   = await import('@/app/api/admin/candidates/[wordId]/regenerate/route');
const { POST: postPublishWord }  = await import('@/app/api/admin/candidates/[wordId]/publish/route');
const { POST: postPublishRound } = await import('@/app/api/admin/rounds/[roundId]/publish/route');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: unknown) {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function wordParams(wordId: string)   { return Promise.resolve({ wordId }); }
function roundParams(roundId: string) { return Promise.resolve({ roundId }); }

beforeEach(() => {
  mockWorkflow.reset();
});

// ─── select ───────────────────────────────────────────────────────────────────

describe('POST /api/admin/candidates/:wordId/select', () => {
  it('saves imageId selection and returns ok', async () => {
    const res = await postSelect(
      makeReq({ roundId: '2026-03-03', imageId: 'img_xk72ms' }),
      { params: wordParams('empathy') },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const word = await mockRepo.getWord('2026-03-03', 'empathy');
    expect(word.selected.imageId).toBe('img_xk72ms');
  });

  it('saves per-level field selections', async () => {
    const res = await postSelect(
      makeReq({ roundId: '2026-03-03', levels: { preK: { definition: 1, example: 0, tryIt: 0 } } }),
      { params: wordParams('empathy') },
    );
    expect(res.status).toBe(200);
    const word = await mockRepo.getWord('2026-03-03', 'empathy');
    expect(word.selected.levels?.preK?.definition).toBe(1);
  });

  it('saves imageIdsByLevel', async () => {
    const res = await postSelect(
      makeReq({
        roundId: '2026-03-03',
        imageId: 'img_primary',
        imageIdsByLevel: { preK: 'img_prek', K: 'img_k', G1: 'img_g1' },
      }),
      { params: wordParams('empathy') },
    );
    expect(res.status).toBe(200);
    const word = await mockRepo.getWord('2026-03-03', 'empathy');
    expect(word.selected.imageIdsByLevel?.preK).toBe('img_prek');
    expect(word.selected.imageIdsByLevel?.K).toBe('img_k');
    expect(word.selected.imageIdsByLevel?.G1).toBe('img_g1');
    expect(word.selected.imageId).toBe('img_primary');
  });

  it('returns 400 when roundId is missing', async () => {
    const res = await postSelect(makeReq({ imageId: 'img_1' }), { params: wordParams('empathy') });
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown word', async () => {
    const res = await postSelect(
      makeReq({ roundId: '2026-03-03' }),
      { params: wordParams('nonexistent') },
    );
    expect(res.status).toBe(404);
  });
});

// ─── subprompt ────────────────────────────────────────────────────────────────

describe('POST /api/admin/candidates/:wordId/subprompt', () => {
  it('saves an image sub-prompt', async () => {
    const res = await postSubprompt(
      makeReq({ roundId: '2026-03-03', field: 'image', text: 'warmer colors' }),
      { params: wordParams('empathy') },
    );
    expect(res.status).toBe(200);
    const word = await mockRepo.getWord('2026-03-03', 'empathy');
    expect(word.subPrompts.image).toBe('warmer colors');
  });

  it('saves a level sub-prompt', async () => {
    const res = await postSubprompt(
      makeReq({ roundId: '2026-03-03', field: 'level', levelId: 'preK', text: 'simpler' }),
      { params: wordParams('empathy') },
    );
    expect(res.status).toBe(200);
    const word = await mockRepo.getWord('2026-03-03', 'empathy');
    expect(word.subPrompts.levels?.preK).toBe('simpler');
  });

  it('returns 400 for invalid field value', async () => {
    const res = await postSubprompt(
      makeReq({ roundId: '2026-03-03', field: 'invalid', text: 'test' }),
      { params: wordParams('empathy') },
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid levelId', async () => {
    const res = await postSubprompt(
      makeReq({ roundId: '2026-03-03', field: 'level', levelId: 'grade5', text: 'test' }),
      { params: wordParams('empathy') },
    );
    expect(res.status).toBe(400);
  });
});

// ─── approve ──────────────────────────────────────────────────────────────────

describe('POST /api/admin/candidates/:wordId/approve', () => {
  it('sets status to approved', async () => {
    const res = await postApprove(
      makeReq({ roundId: '2026-03-03' }),
      { params: wordParams('empathy') },
    );
    expect(res.status).toBe(200);
    const word = await mockRepo.getWord('2026-03-03', 'empathy');
    expect(word.status).toBe('approved');
  });

  it('does NOT trigger any workflow', async () => {
    await postApprove(makeReq({ roundId: '2026-03-03' }), { params: wordParams('gratitude') });
    expect(mockWorkflow.calls).toHaveLength(0);
  });

  it('returns 404 for unknown word', async () => {
    const res = await postApprove(
      makeReq({ roundId: '2026-03-03' }),
      { params: wordParams('nonexistent') },
    );
    expect(res.status).toBe(404);
  });
});

// ─── regenerate ───────────────────────────────────────────────────────────────

describe('POST /api/admin/candidates/:wordId/regenerate', () => {
  it('sets status to needs_regen and triggers workflow (image/replace)', async () => {
    const res = await postRegenerate(
      makeReq({ roundId: '2026-03-03', type: 'image', mode: 'replace', prompt: 'bright colors' }),
      { params: wordParams('resilience') },
    );
    expect(res.status).toBe(200);

    const word = await mockRepo.getWord('2026-03-03', 'resilience');
    expect(word.status).toBe('needs_regen');

    expect(mockWorkflow.calls).toHaveLength(1);
    expect(mockWorkflow.calls[0].method).toBe('triggerRegeneration');
    expect(mockWorkflow.calls[0].options).toMatchObject({ type: 'image', mode: 'replace' });
  });

  it('triggers workflow for type=image mode=subprompt with subprompt text', async () => {
    const res = await postRegenerate(
      makeReq({ roundId: '2026-03-03', type: 'image', mode: 'subprompt', subprompt: 'warmer colors' }),
      { params: wordParams('resilience') },
    );
    expect(res.status).toBe(200);
    expect(mockWorkflow.calls[0].options).toMatchObject({
      type: 'image', mode: 'subprompt', subprompt: 'warmer colors',
    });
  });

  it('triggers workflow for type=full with correct levels', async () => {
    const res = await postRegenerate(
      makeReq({ roundId: '2026-03-03', type: 'full', levels: ['preK', 'K'] }),
      { params: wordParams('gratitude') },
    );
    expect(res.status).toBe(200);
    expect(mockWorkflow.calls[0].options).toMatchObject({ type: 'full', levels: ['preK', 'K'] });
  });

  it('triggers workflow for type=full with optional subprompt', async () => {
    const res = await postRegenerate(
      makeReq({ roundId: '2026-03-03', type: 'full', levels: ['G1'], subprompt: 'use simpler words' }),
      { params: wordParams('gratitude') },
    );
    expect(res.status).toBe(200);
    expect(mockWorkflow.calls[0].options).toMatchObject({
      type: 'full', levels: ['G1'], subprompt: 'use simpler words',
    });
  });

  it('returns 400 for missing mode when type=image', async () => {
    const res = await postRegenerate(
      makeReq({ roundId: '2026-03-03', type: 'image' }),
      { params: wordParams('empathy') },
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for empty levels array when type=full', async () => {
    const res = await postRegenerate(
      makeReq({ roundId: '2026-03-03', type: 'full', levels: [] }),
      { params: wordParams('empathy') },
    );
    expect(res.status).toBe(400);
  });
});

// ─── publish (per-word) ───────────────────────────────────────────────────────

describe('POST /api/admin/candidates/:wordId/publish', () => {
  it('triggers publish workflow for an approved word', async () => {
    // curiosity is already approved in mock data
    const res = await postPublishWord(
      makeReq({ roundId: '2026-03-03' }),
      { params: wordParams('curiosity') },
    );
    expect(res.status).toBe(200);
    expect(mockWorkflow.calls[0].method).toBe('triggerPublish');
    expect(mockWorkflow.calls[0].wordId).toBe('curiosity');
  });

  it('returns 409 when word is not yet approved', async () => {
    const res = await postPublishWord(
      makeReq({ roundId: '2026-03-03' }),
      { params: wordParams('resilience') },
    );
    expect(res.status).toBe(409);
    expect(mockWorkflow.calls).toHaveLength(0);
  });

  it('returns 404 for unknown word', async () => {
    const res = await postPublishWord(
      makeReq({ roundId: '2026-03-03' }),
      { params: wordParams('nonexistent') },
    );
    expect(res.status).toBe(404);
  });
});

// ─── publish (per-round) ──────────────────────────────────────────────────────

describe('POST /api/admin/rounds/:roundId/publish', () => {
  it('triggers round publish when approved words exist', async () => {
    // 2026-03-03 has curiosity (approved) in mock data
    const res = await postPublishRound(
      new Request('http://localhost/'),
      { params: roundParams('2026-03-03') },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.wordCount).toBeGreaterThan(0);
    expect(mockWorkflow.calls[0].method).toBe('triggerRoundPublish');
  });

  it('returns 409 when no approved words exist in the round', async () => {
    const res = await postPublishRound(
      new Request('http://localhost/'),
      { params: roundParams('2026-03-01') },
    );
    // 2026-03-01 has persevere (needs_regen) and inspire (pending) — neither approved
    expect(res.status).toBe(409);
    expect(mockWorkflow.calls).toHaveLength(0);
  });
});
