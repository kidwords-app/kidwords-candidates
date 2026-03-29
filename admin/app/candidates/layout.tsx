import { candidateRepo } from '@/lib/providers';
import Sidebar from '@/components/Sidebar';
import type { WordStatus } from '@/lib/types';

export default async function CandidatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const words = await candidateRepo.listWords();

  const rounds = [...new Set(words.map((w) => w.roundId))].sort().reverse();

  const statusKeys: WordStatus[] = ['pending', 'in_review', 'approved', 'needs_regen'];

  const statusCounts = Object.fromEntries(
    statusKeys.map((s) => [s, words.filter((w) => w.status === s).length]),
  ) as Record<WordStatus, number>;

  const roundCounts = Object.fromEntries(
    rounds.map((r) => [r, words.filter((w) => w.roundId === r).length]),
  );

  return (
    <div className="app-shell">
      <Sidebar
        rounds={rounds}
        roundCounts={roundCounts}
        totalCount={words.length}
        statusCounts={statusCounts}
      />
      <main className="app-main">{children}</main>
    </div>
  );
}
