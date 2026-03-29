'use client';

import { useState } from 'react';
import type { LevelId, LevelCandidate, FieldSelection } from '@/lib/types';

interface Props {
  wordId:           string;
  roundId:          string;
  levels:           Partial<Record<LevelId, LevelCandidate[]>>;
  selectedLevels:   Partial<Record<LevelId, FieldSelection>>;
  subpromptLevels:  Partial<Record<LevelId, string>>;
  onFieldSelect:    (level: LevelId, field: keyof FieldSelection, idx: number) => void;
  onSubpromptSave:  (level: LevelId, text: string) => Promise<void>;
}

const LEVEL_IDS: LevelId[] = ['preK', 'K', 'G1'];
const FIELDS: (keyof FieldSelection)[] = ['definition', 'example', 'tryIt'];
const FIELD_LABELS: Record<keyof FieldSelection, string> = {
  definition: 'Definition',
  example:    'Example',
  tryIt:      'Try It',
};

function FieldSection({
  field,
  candidates,
  selectedIdx,
  onSelect,
}: {
  field:       keyof FieldSelection;
  candidates:  LevelCandidate[];
  selectedIdx: number | undefined;
  onSelect:    (idx: number) => void;
}) {
  if (candidates.length === 0) {
    return (
      <div className="field-section">
        <div className="field-section-label">
          <span className="field-section-label-text">{FIELD_LABELS[field]}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px 0' }}>No candidates yet.</div>
      </div>
    );
  }

  return (
    <div className="field-section">
      <div className="field-section-label">
        <span className="field-section-label-text">{FIELD_LABELS[field]}</span>
      </div>
      {candidates.map((c, i) => (
        <div
          key={i}
          className={`field-option ${selectedIdx === i ? 'selected' : ''}`}
          onClick={() => onSelect(i)}
        >
          <input
            type="radio"
            checked={selectedIdx === i}
            onChange={() => onSelect(i)}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="field-option-body">
            <div className="field-option-meta">
              <span className="attempt-num">#{i + 1}</span>
              <span className="model-badge">{c.model}</span>
            </div>
            <div className="field-option-text">{c[field]}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DefinitionPanel({
  wordId,
  roundId,
  levels,
  selectedLevels,
  subpromptLevels,
  onFieldSelect,
  onSubpromptSave,
}: Props) {
  const [activeLevel, setActiveLevel] = useState<LevelId>('preK');
  const [subpromptTexts, setSubpromptTexts] = useState<Partial<Record<LevelId, string>>>(
    () => ({ ...subpromptLevels }),
  );
  const [saving, setSaving] = useState<LevelId | null>(null);

  const candidates = levels[activeLevel] ?? [];
  const sel = selectedLevels[activeLevel];

  async function handleSubpromptSave(level: LevelId) {
    setSaving(level);
    try {
      await onSubpromptSave(level, subpromptTexts[level] ?? '');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <div className="col-label">
        📖 Level Definitions
        <span className="col-label-hint">mix &amp; match fields</span>
      </div>

      <div className="tabs">
        {LEVEL_IDS.map((level) => {
          const hasData = (levels[level]?.length ?? 0) > 0;
          return (
            <button
              key={level}
              className={`tab-btn ${activeLevel === level ? 'active' : ''}`}
              onClick={() => setActiveLevel(level)}
            >
              {level}
              {hasData && (
                <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--text-3)' }}>
                  ({levels[level]!.length})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {candidates.length === 0 ? (
        <div className="empty-state" style={{ padding: '24px 0' }}>
          <div className="big-icon">📝</div>
          <div>No definition candidates for {activeLevel} yet.</div>
        </div>
      ) : (
        <>
          {FIELDS.map((field) => (
            <FieldSection
              key={field}
              field={field}
              candidates={candidates}
              selectedIdx={sel?.[field]}
              onSelect={(idx) => onFieldSelect(activeLevel, field, idx)}
            />
          ))}

          {/* Level sub-prompt */}
          <div className="subprompt-section" style={{ marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div className="subprompt-label">✏️ {activeLevel} sub-prompt</div>
            <textarea
              className="subprompt-input"
              rows={2}
              placeholder={`Guidance for the next ${activeLevel} generation run…`}
              value={subpromptTexts[activeLevel] ?? ''}
              onChange={(e) =>
                setSubpromptTexts((prev) => ({ ...prev, [activeLevel]: e.target.value }))
              }
            />
            <div className="save-row">
              <div className="tooltip-wrap">
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => handleSubpromptSave(activeLevel)}
                  disabled={saving === activeLevel}
                >
                  {saving === activeLevel ? '…' : '💾 Save sub-prompt'}
                </button>
                <span className="tooltip-tip">
                  POST /api/admin/candidates/:wordId/subprompt {`{"field":"level","levelId":"${activeLevel}"}`}
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
