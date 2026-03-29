'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { WordCandidate, WordStatus } from '@/lib/types';

const LEVEL_IDS = ['preK', 'K', 'G1'] as const;

const STATUS_LABELS: Record<WordStatus, string> = {
  pending:     'pending',
  in_review:   'in review',
  approved:    'approved',
  needs_regen: 'needs regen',
};

type SortKey = 'word' | 'status' | 'round' | 'updated';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function levelDefCount(word: WordCandidate) {
  return LEVEL_IDS.filter((l) => (word.levels?.[l]?.length ?? 0) > 0).length;
}

export default function CandidateTable({ words }: { words: WordCandidate[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [sort,   setSort]   = useState<SortKey>('word');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q
      ? words.filter((w) => w.word.toLowerCase().includes(q) || w.wordId.includes(q))
      : [...words];

    list.sort((a, b) => {
      switch (sort) {
        case 'word':    return a.word.localeCompare(b.word);
        case 'status':  return a.status.localeCompare(b.status);
        case 'round':   return b.roundId.localeCompare(a.roundId);
        case 'updated': return b.updatedAt.localeCompare(a.updatedAt);
        default: return 0;
      }
    });
    return list;
  }, [words, search, sort]);

  function openDetail(word: WordCandidate) {
    router.push(`/candidates/${word.wordId}?roundId=${word.roundId}`);
  }

  return (
    <>
      {/* Top bar */}
      <div className="topbar">
        <div className="topbar-title">Word Candidates</div>
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search words…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="sort-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          <option value="word">Sort: Word A–Z</option>
          <option value="status">Sort: Status</option>
          <option value="round">Sort: Round</option>
          <option value="updated">Sort: Last Updated</option>
        </select>
      </div>

      {/* Table */}
      <div className="content-area">
        <div className="card">
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="big-icon">🔍</div>
              <div>No words match your filter.</div>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Word</th>
                  <th>Status</th>
                  <th>Round</th>
                  <th>Images</th>
                  <th>Definitions</th>
                  <th>Last Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((word) => (
                  <tr key={`${word.roundId}-${word.wordId}`}>
                    <td>
                      <a
                        className="word-link"
                        onClick={() => openDetail(word)}
                      >
                        {word.word}
                      </a>
                      {word.tags.length > 0 && (
                        <div style={{ marginTop: 3, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {word.tags.slice(0, 2).map((t) => (
                            <span key={t} className="tag-chip" style={{ fontSize: 10, padding: '1px 6px' }}>{t}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`status-pill pill-${word.status}`}>
                        {STATUS_LABELS[word.status]}
                      </span>
                    </td>
                    <td>
                      <span className="round-chip">{word.roundId}</span>
                    </td>
                    <td>
                      <span className="count-text">{word.images?.length ?? 0} candidate{word.images?.length !== 1 ? 's' : ''}</span>
                    </td>
                    <td>
                      <span className="count-text">
                        {levelDefCount(word)}/{LEVEL_IDS.length} levels
                      </span>
                    </td>
                    <td>
                      <span className="date-text">{fmtDate(word.updatedAt)}</span>
                    </td>
                    <td>
                      <div className="action-group">
                        <div className="tooltip-wrap">
                          <button
                            className="btn btn-review btn-sm"
                            onClick={() => openDetail(word)}
                          >
                            Review
                          </button>
                          <span className="tooltip-tip">GET /api/admin/candidates/{word.wordId}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
