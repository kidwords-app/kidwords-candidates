import { NextResponse } from 'next/server';
import { candidateRepo, workflowClient } from '@/lib/providers';
import { NotFoundError, ProviderError } from '@/lib/types';

/**
 * POST /api/admin/rounds/:roundId/publish
 *
 * Publishes all "approved" words in a round to the public app repo.
 * Returns 409 if no approved words exist in the round.
 *
 * Body: (empty — roundId comes from the path)
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ roundId: string }> },
) {
  const { roundId } = await params;

  try {
    const approvedWords = await candidateRepo.listWords({ roundId, status: 'approved' });

    if (approvedWords.length === 0) {
      return NextResponse.json(
        { error: `No approved words found in round "${roundId}"` },
        { status: 409 },
      );
    }

    await workflowClient.triggerRoundPublish(roundId);
    return NextResponse.json({ ok: true, wordCount: approvedWords.length });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ProviderError)  return NextResponse.json({ error: err.message }, { status: 502 });
    console.error(`[POST /api/admin/rounds/${roundId}/publish]`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
