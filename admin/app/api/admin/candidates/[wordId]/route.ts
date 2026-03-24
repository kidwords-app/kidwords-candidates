import { type NextRequest, NextResponse } from 'next/server';
import { candidateRepo } from '@/lib/providers';
import { ProviderError, NotFoundError } from '@/lib/types';

/**
 * GET /api/admin/candidates/:wordId
 *
 * Query params:
 *   roundId — required; the round the word belongs to
 *
 * Response:
 *   WordCandidate
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wordId: string }> },
) {
  const { wordId } = await params;
  const roundId = req.nextUrl.searchParams.get('roundId');

  if (!roundId) {
    return NextResponse.json(
      { error: 'roundId query parameter is required' },
      { status: 400 },
    );
  }

  try {
    const word = await candidateRepo.getWord(roundId, wordId);
    return NextResponse.json(word);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof ProviderError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error(`[GET /api/admin/candidates/${wordId}]`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
