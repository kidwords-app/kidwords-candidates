import { candidateRepo } from '@/lib/providers';
import CandidateTable from '@/components/CandidateTable';
import type { WordStatus } from '@/lib/types';

interface PageProps {
  searchParams: Promise<{ roundId?: string; status?: string }>;
}

export default async function CandidatesPage({ searchParams }: PageProps) {
  const { roundId, status } = await searchParams;

  const validStatuses: WordStatus[] = ['pending', 'in_review', 'approved', 'needs_regen'];
  const safeStatus = validStatuses.includes(status as WordStatus)
    ? (status as WordStatus)
    : undefined;

  const words = await candidateRepo.listWords({
    roundId: roundId || undefined,
    status:  safeStatus,
  });

  return <CandidateTable words={words} />;
}
