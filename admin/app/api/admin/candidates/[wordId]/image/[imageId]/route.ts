import { NextRequest, NextResponse } from 'next/server';
import { assetRepo } from '@/lib/providers';

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
    const data = await assetRepo.getImageAsset(roundId, wordId, imageId);
    return new NextResponse(data as unknown as BodyInit, {
      headers: {
        'Content-Type':  'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json({ error: 'image not found' }, { status: 404 });
  }
}
