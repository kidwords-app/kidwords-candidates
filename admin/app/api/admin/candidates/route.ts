import { NextResponse } from 'next/server';
import { candidateRepo } from '@/lib/providers';
import { ProviderError, NotFoundError, type WordStatus } from '@/lib/types';

const VALID_STATUSES = new Set<WordStatus>(['pending', 'in_review', 'approved', 'needs_regen']);

/**
 * GET /api/admin/candidates
 *
 * Query params:
 *   roundId  — filter by round (optional)
 *   status   — filter by status (optional)
 *
 * Response:
 *   { words: WordCandidate[] }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const roundId = searchParams.get('roundId') ?? undefined;
  const statusParam = searchParams.get('status');

  if (statusParam && !VALID_STATUSES.has(statusParam as WordStatus)) {
    return NextResponse.json(
      { error: `Invalid status "${statusParam}". Must be one of: ${[...VALID_STATUSES].join(', ')}` },
      { status: 400 },
    );
  }

  const status = statusParam as WordStatus | undefined;

  try {
    const words = await candidateRepo.listWords({ roundId, status });
    return NextResponse.json({ words });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof ProviderError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    console.error('[GET /api/admin/candidates]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
