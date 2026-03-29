import { NextResponse } from 'next/server';
import { candidateRepo } from '@/lib/providers';
import { NotFoundError, ProviderError } from '@/lib/types';

/**
 * POST /api/admin/candidates/:wordId/approve
 *
 * Sets word status to "approved". Does NOT trigger publish.
 * Use POST /api/admin/candidates/:wordId/publish or
 *     POST /api/admin/rounds/:roundId/publish when ready to push to the public app.
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
    await candidateRepo.setStatus(roundId, wordId, 'approved');
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof NotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
    if (err instanceof ProviderError)  return NextResponse.json({ error: err.message }, { status: 502 });
    console.error(`[POST /api/admin/candidates/${wordId}/approve]`, err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
