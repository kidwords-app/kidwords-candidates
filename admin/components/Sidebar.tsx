'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import type { WordStatus } from '@/lib/types';

interface Props {
  rounds:       string[];
  roundCounts:  Record<string, number>;
  totalCount:   number;
  statusCounts: Record<WordStatus, number>;
}

const STATUS_CONFIG: { value: WordStatus | 'all'; label: string; color: string; badgeClass: string }[] = [
  { value: 'all',         label: 'All',         color: 'var(--teal)',    badgeClass: 'badge teal'   },
  { value: 'pending',     label: 'Pending',     color: '#94a3b8',        badgeClass: 'badge'        },
  { value: 'in_review',   label: 'In Review',   color: '#eab308',        badgeClass: 'badge yellow' },
  { value: 'approved',    label: 'Approved',    color: 'var(--teal)',    badgeClass: 'badge teal'   },
  { value: 'needs_regen', label: 'Needs Regen', color: '#ef4444',        badgeClass: 'badge red'    },
];

export default function Sidebar({ rounds, roundCounts, totalCount, statusCounts }: Props) {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();

  const activeRound  = searchParams.get('roundId') ?? 'all';
  const activeStatus = searchParams.get('status')  ?? 'all';

  function navigate(roundId?: string, status?: string) {
    const params = new URLSearchParams();
    if (roundId && roundId !== 'all') params.set('roundId', roundId);
    if (status  && status  !== 'all') params.set('status', status);
    const qs = params.toString();
    router.push(`/candidates${qs ? `?${qs}` : ''}`);
  }

  const isOnList = pathname === '/candidates';

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">K</div>
        <div>
          <div className="logo-name">KidWords Admin</div>
          <div className="logo-sub">Review Portal</div>
        </div>
      </div>

      {/* Rounds */}
      <div className="sidebar-section">
        <div className="sidebar-section-label">Rounds</div>
        <div
          className={`sidebar-item ${isOnList && activeRound === 'all' ? 'active' : ''}`}
          onClick={() => navigate('all', activeStatus)}
        >
          <div className="sidebar-item-left">
            <span className="sidebar-icon">📋</span>
            All Rounds
          </div>
        </div>
        {rounds.map((r) => (
          <div
            key={r}
            className={`sidebar-item ${isOnList && activeRound === r ? 'active' : ''}`}
            onClick={() => navigate(r, activeStatus)}
          >
            <div className="sidebar-item-left">
              <span className="sidebar-icon">🗓</span>
              {r}
            </div>
            <span className="badge">{roundCounts[r] ?? 0}</span>
          </div>
        ))}
      </div>

      <div className="sidebar-divider" />

      {/* Status */}
      <div className="sidebar-section">
        <div className="sidebar-section-label">Status</div>
        {STATUS_CONFIG.map(({ value, label, color, badgeClass }) => {
          const count = value === 'all' ? totalCount : (statusCounts[value as WordStatus] ?? 0);
          return (
            <div
              key={value}
              className={`sidebar-item ${isOnList && activeStatus === value ? 'active' : ''}`}
              onClick={() => navigate(activeRound, value)}
            >
              <div className="sidebar-item-left">
                <span className="sidebar-icon" style={{ color }}>●</span>
                {label}
              </div>
              <span className={badgeClass}>{count}</span>
            </div>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <a href="#" onClick={(e) => e.preventDefault()}>
          <span>❓</span> Help &amp; Documentation
        </a>
      </div>
    </nav>
  );
}
