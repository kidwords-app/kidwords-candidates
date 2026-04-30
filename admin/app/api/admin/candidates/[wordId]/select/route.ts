import { NextResponse } from 'next/server';
import { candidateRepo } from '@/lib/providers';
import { NotFoundError, ProviderError } from '@/lib/types';
import type { LevelId, Selections } from '@/lib/types';

const LEVEL_KEYS = new Set<LevelId>(['preK', 'K', 'G1']);

function parseImageIdsByLevel(raw: unknown): Selections['imageIdsByLevel'] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('INVALID_IMAGE_IDS_BY_LEVEL');
  }
  const out: Partial<Record<LevelId, string>> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!LEVEL_KEYS.has(k as LevelId)) continue;
    if (typeof v !== 'string' || !v) continue;
    out[k as LevelId] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * POST /api/admin/candidates/:wordId/select
 *
 * Body: { roundId: string } & Selections
 *   roundId          — required
 *   imageId          — optional; ID of the selected image candidate
 *   imageIdsByLevel  — optional; per-grade image picks when assets are level-specific (not shared-*)
 *   levels           — optional; per-level per-field candidate indexes
 *
 * Example body:
 *   {
 *     "roundId": "2026-03-03",
 *     "imageId": "img_xk72ms",
 *     "levels": {
 *       "preK": { "definition": 0, "example": 1, "tryIt": 0 }
 *     }
 *   }
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

  const { roundId, imageId, imageIdsByLevel, levels } = body as {
    roundId?:         unknown;
    imageId?:         unknown;
    imageIdsByLevel?: unknown;
    levels?:          unknown;
  };

  if (!roundId || typeof roundId !== 'string') {
    return NextResponse.json({ error: 'roundId is required' }, { status: 400 });
  }
  if (imageId !== undefined && typeof imageId !== 'string') {
    return NextResponse.json({ error: 'imageId must be a string' }, { status: 400 });
  }

  let parsedByLevel: Selections['imageIdsByLevel'];
  try {
    parsedByLevel = parseImageIdsByLevel(imageIdsByLevel);
  } catch {
    return NextResponse.json({ error: 'imageIdsByLevel must be an object of level → image id strings' }, { status: 400 });
  }

  const selections: Selections = {};
  if (imageId) selections.imageId = imageId;
  if (parsedByLevel) selections.imageIdsByLevel = parsedByLevel;
  if (levels && typeof levels === 'object') selections.levels = levels as Selections['levels'];

  try {
    await candidateRepo.saveSelections(roundId, wordId, selections);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ProviderError)  return NextResponse.json({ error: err.message }, { status: 502 });
    console.error(`[POST /api/admin/candidates/${wordId}/select]`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
