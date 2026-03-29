import { NextResponse } from 'next/server';
import { candidateRepo, workflowClient } from '@/lib/providers';
import { NotFoundError, ProviderError } from '@/lib/types';
import type { RegenOptions, LevelId } from '@/lib/types';

const VALID_LEVELS = new Set<LevelId>(['preK', 'K', 'G1']);

/**
 * POST /api/admin/candidates/:wordId/regenerate
 *
 * Sets word status to "needs_regen" then triggers the appropriate workflow.
 *
 * Body variants:
 *   Image — replace prompt:
 *     { "roundId": "...", "type": "image", "mode": "replace", "prompt": "..." }
 *   Image — append sub-prompt:
 *     { "roundId": "...", "type": "image", "mode": "subprompt", "subprompt": "..." }
 *   Full text + image:
 *     { "roundId": "...", "type": "full", "levels": ["preK","K"], "subprompt": "..." }
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

  const { roundId, type, mode, prompt, subprompt, levels } = body as Record<string, unknown>;

  if (!roundId || typeof roundId !== 'string') {
    return NextResponse.json({ error: 'roundId is required' }, { status: 400 });
  }
  if (type !== 'image' && type !== 'full') {
    return NextResponse.json({ error: 'type must be "image" or "full"' }, { status: 400 });
  }

  let options: RegenOptions;

  if (type === 'image') {
    if (mode !== 'replace' && mode !== 'subprompt') {
      return NextResponse.json({ error: 'mode must be "replace" or "subprompt"' }, { status: 400 });
    }
    if (mode === 'replace' && (typeof prompt !== 'string' || !prompt.trim())) {
      return NextResponse.json({ error: 'prompt is required for mode "replace"' }, { status: 400 });
    }
    if (mode === 'subprompt' && (typeof subprompt !== 'string' || !subprompt.trim())) {
      return NextResponse.json({ error: 'subprompt is required for mode "subprompt"' }, { status: 400 });
    }
    options = mode === 'replace'
      ? { type: 'image', mode: 'replace',   prompt:    prompt    as string }
      : { type: 'image', mode: 'subprompt', subprompt: subprompt as string };
  } else {
    const lvls = Array.isArray(levels) ? (levels as unknown[]).filter((l): l is LevelId => VALID_LEVELS.has(l as LevelId)) : [];
    if (lvls.length === 0) {
      return NextResponse.json(
        { error: `levels must be a non-empty array of: ${[...VALID_LEVELS].join(', ')}` },
        { status: 400 },
      );
    }
    options = {
      type: 'full',
      levels: lvls,
      subprompt: typeof subprompt === 'string' ? subprompt : undefined,
    };
  }

  try {
    await candidateRepo.setStatus(roundId, wordId, 'needs_regen');
    await workflowClient.triggerRegeneration(wordId, roundId, options);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ProviderError)  return NextResponse.json({ error: err.message }, { status: 502 });
    console.error(`[POST /api/admin/candidates/${wordId}/regenerate]`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
