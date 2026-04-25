import { NextResponse } from 'next/server';
import { candidateRepo } from '@/lib/providers';
import { NotFoundError, ProviderError } from '@/lib/types';
import type { SubpromptInput, LevelId } from '@/lib/types';

const VALID_LEVELS = new Set<LevelId>(['preK', 'K', 'G1']);

/**
 * POST /api/admin/candidates/:wordId/subprompt
 *
 * Body (image):
 *   { "roundId": "2026-03-03", "field": "image", "text": "warmer colors" }
 *
 * Body (level):
 *   { "roundId": "2026-03-03", "field": "level", "levelId": "preK", "text": "simpler words" }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ wordId: string }> },
) {
  const { wordId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { roundId, field, levelId, text } = body as Record<string, unknown>;

  if (!roundId || typeof roundId !== 'string') {
    return NextResponse.json({ error: 'roundId is required' }, { status: 400 });
  }
  if (field !== 'image' && field !== 'level') {
    return NextResponse.json({ error: 'field must be "image" or "level"' }, { status: 400 });
  }
  if (typeof text !== 'string') {
    return NextResponse.json({ error: 'text must be a string' }, { status: 400 });
  }
  if (field === 'level') {
    if (!levelId || !VALID_LEVELS.has(levelId as LevelId)) {
      return NextResponse.json(
        { error: `levelId must be one of: ${[...VALID_LEVELS].join(', ')}` },
        { status: 400 },
      );
    }
  }

  const input: SubpromptInput =
    field === 'image'
      ? { field: 'image', text: text as string }
      : { field: 'level', levelId: levelId as LevelId, text: text as string };

  try {
    await candidateRepo.saveSubprompt(roundId, wordId, input);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ProviderError)  return NextResponse.json({ error: err.message }, { status: 502 });
    console.error(`[POST /api/admin/candidates/${wordId}/subprompt]`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
