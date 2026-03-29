import { candidateRepo } from '@/lib/providers';
import { notFound, redirect } from 'next/navigation';
import { NotFoundError } from '@/lib/types';
import WordDetailClient from '@/components/WordDetailClient';

interface PageProps {
  params:       Promise<{ wordId: string }>;
  searchParams: Promise<{ roundId?: string }>;
}

export default async function WordDetailPage({ params, searchParams }: PageProps) {
  const { wordId }  = await params;
  const { roundId } = await searchParams;

  if (!roundId) redirect('/candidates');

  try {
    const word = await candidateRepo.getWord(roundId, wordId);
    return <WordDetailClient word={word} />;
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
}
