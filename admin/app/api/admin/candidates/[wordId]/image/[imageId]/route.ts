import { NextRequest, NextResponse } from 'next/server';
import { assetRepo, candidateRepo } from '@/lib/providers';
import { NotFoundError } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ wordId: string; imageId: string }> },
) {
  const { wordId, imageId } = await params;
  const roundId = new URL(req.url).searchParams.get('roundId');

  if (!roundId) {
    return NextResponse.json({ error: 'roundId required' }, { status: 400 });
  }

  try {
    // Look up the assetPath from the candidate JSON — the imageId alone is not
    // enough to reconstruct the filename (it has a level-prefix in the real data).
    const word = await candidateRepo.getWord(roundId, wordId);
    const candidate = word.images?.find((img) => img.imageId === imageId);
    if (!candidate) {
      return NextResponse.json({ error: 'image not found' }, { status: 404 });
    }

    const data = await assetRepo.getImageAsset(candidate.assetPath);
    return new NextResponse(data as unknown as BodyInit, {
      headers: {
        'Content-Type':  'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    throw e;
  }
}
