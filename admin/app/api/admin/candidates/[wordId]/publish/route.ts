import { NextResponse } from 'next/server';
import { candidateRepo, workflowClient } from '@/lib/providers';
import { NotFoundError, ProviderError } from '@/lib/types';

/**
 * POST /api/admin/candidates/:wordId/publish
 *
 * Publishes a single approved word to the public app repo.
 * The word must have status "approved" — returns 409 otherwise.
 *
 * Body: { "roundId": "2026-03-03" }
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

  const { roundId } = body;
  if (!roundId || typeof roundId !== 'string') {
    return NextResponse.json({ error: 'roundId is required' }, { status: 400 });
  }

  try {
    const word = await candidateRepo.getWord(roundId, wordId);

    if (word.status !== 'approved') {
      return NextResponse.json(
        { error: `Word must be approved before publishing. Current status: "${word.status}"` },
        { status: 409 },
      );
    }

    await workflowClient.triggerPublish(wordId, roundId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ProviderError) {
      console.error(`[POST /api/admin/candidates/${wordId}/publish] GitHub error ${err.statusCode}:`, err.message);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error(`[POST /api/admin/candidates/${wordId}/publish]`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
