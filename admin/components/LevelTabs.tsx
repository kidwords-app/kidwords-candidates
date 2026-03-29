'use client';

import { useState } from 'react';
import type { ImageCandidate, LevelCandidate, LevelId, FieldSelection } from '@/lib/types';
import { imageLevelId, LEVEL_LABELS } from '@/lib/imageLevel';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  wordId:               string;
  roundId:              string;
  images:               ImageCandidate[];
  levels:               Partial<Record<LevelId, LevelCandidate[]>>;
  selectedImageId:      string | undefined;
  selectedLevels:       Partial<Record<LevelId, FieldSelection>>;
  subpromptLevels:      Partial<Record<LevelId, string>>;
  initialImageSubprompt: string;
  onImageSelect:        (imageId: string) => void;
  onFieldSelect:        (level: LevelId, field: keyof FieldSelection, idx: number) => void;
  onImageSubpromptSave: (text: string) => Promise<void>;
  onLevelSubpromptSave: (level: LevelId, text: string) => Promise<void>;
}

const LEVEL_IDS: LevelId[] = ['preK', 'K', 'G1'];
const LEVEL_SUBLABELS: Record<LevelId, string> = {
  preK: 'preschooler',
  K:    'kindergarten',
  G1:   '1st grade',
};
const FIELDS: (keyof FieldSelection)[] = ['definition', 'example', 'tryIt'];
const FIELD_LABELS: Record<keyof FieldSelection, string> = {
  definition: 'Definition',
  example:    'Example',
  tryIt:      'Try It',
};

// ─── Image card ───────────────────────────────────────────────────────────────

function ImageCard({
  img, wordId, roundId, selected, onSelect,
}: {
  img: ImageCandidate; wordId: string; roundId: string; selected: boolean; onSelect: () => void;
}) {
  return (
    <div className={`img-card ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="img-placeholder">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/admin/candidates/${wordId}/image/${img.imageId}?roundId=${roundId}`}
          alt={img.prompt}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
            const fb = e.currentTarget.parentElement?.querySelector<HTMLElement>('.img-fallback');
            if (fb) fb.style.display = 'flex';
          }}
        />
        <span className="img-fallback" style={{
          display: 'none', position: 'absolute', inset: 0,
          alignItems: 'center', justifyContent: 'center', fontSize: 40, color: 'var(--text-3)',
        }}>🖼</span>
        <span className="img-id-overlay">{img.imageId}</span>
      </div>
      <div className="img-card-body">
        <div className="img-prompt">{img.prompt}</div>
        <div className="img-card-footer">
          <span className="model-badge">{img.model}</span>
          <span className="card-date">
            {new Date(img.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>
      <div className="radio-row" onClick={(e) => e.stopPropagation()}>
        <input
          type="radio"
          id={`img-${img.imageId}`}
          name="selected-image"
          checked={selected}
          onChange={onSelect}
        />
        <label htmlFor={`img-${img.imageId}`}>{selected ? '✓ Selected' : 'Select this image'}</label>
      </div>
    </div>
  );
}

// ─── Per-level panel ──────────────────────────────────────────────────────────

function LevelPanel({
  level, wordId, roundId,
  levelImages, candidates, sel, initialSubprompt, initialImgSubprompt,
  selectedImageId, onImageSelect, onFieldSelect, onLevelSubpromptSave, onImageSubpromptSave,
}: {
  level:               LevelId;
  wordId:              string;
  roundId:             string;
  levelImages:         ImageCandidate[];
  candidates:          LevelCandidate[];
  sel:                 FieldSelection | undefined;
  initialSubprompt:    string;
  initialImgSubprompt: string;
  selectedImageId:     string | undefined;
  onImageSelect:       (imageId: string) => void;
  onFieldSelect:       (field: keyof FieldSelection, idx: number) => void;
  onLevelSubpromptSave:(text: string) => Promise<void>;
  onImageSubpromptSave:(text: string) => Promise<void>;
}) {
  const [levelSubprompt, setLevelSubprompt] = useState(initialSubprompt);
  const [imgSubprompt,   setImgSubprompt]   = useState(initialImgSubprompt);
  const [savingLevel,    setSavingLevel]     = useState(false);
  const [savingImg,      setSavingImg]       = useState(false);

  return (
    <div className="level-two-col">

      {/* ── Left: image for this level ── */}
      <div>
        <div className="col-label">🖼 Image</div>

        {levelImages.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <div className="big-icon">🖼</div>
            <div>No image candidate for {LEVEL_LABELS[level]} yet.</div>
          </div>
        ) : (
          levelImages.map((img) => (
            <ImageCard
              key={img.imageId}
              img={img}
              wordId={wordId}
              roundId={roundId}
              selected={selectedImageId === img.imageId}
              onSelect={() => onImageSelect(img.imageId)}
            />
          ))
        )}

        <div className="subprompt-section">
          <div className="subprompt-label">🎨 Image sub-prompt</div>
          <textarea
            className="subprompt-input"
            rows={2}
            placeholder="e.g. 'warmer colors, outdoor setting'"
            value={imgSubprompt}
            onChange={(e) => setImgSubprompt(e.target.value)}
          />
          <div className="save-row">
            <div className="tooltip-wrap">
              <button
                className="btn btn-outline btn-sm"
                disabled={savingImg}
                onClick={async () => {
                  setSavingImg(true);
                  try { await onImageSubpromptSave(imgSubprompt); } finally { setSavingImg(false); }
                }}
              >
                {savingImg ? '…' : '💾 Save'}
              </button>
              <span className="tooltip-tip">POST /api/admin/candidates/:wordId/subprompt {`{"field":"image"}`}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: definitions for this level ── */}
      <div className="level-defs-col">
        <div className="col-label">
          📖 Definition
          <span className="col-label-hint">mix &amp; match</span>
        </div>

        {candidates.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <div className="big-icon">📝</div>
            <div>No definition candidates for {LEVEL_LABELS[level]} yet.</div>
          </div>
        ) : (
          <>
            {FIELDS.map((field) => (
              <div key={field} className="field-section">
                <div className="field-section-label">
                  <span className="field-section-label-text">{FIELD_LABELS[field]}</span>
                </div>
                {candidates.map((c, i) => (
                  <div
                    key={i}
                    className={`field-option ${sel?.[field] === i ? 'selected' : ''}`}
                    onClick={() => onFieldSelect(field, i)}
                  >
                    <input
                      type="radio"
                      checked={sel?.[field] === i}
                      onChange={() => onFieldSelect(field, i)}
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
            ))}

            <div className="subprompt-section">
              <div className="subprompt-label">✏️ {level} text sub-prompt</div>
              <textarea
                className="subprompt-input"
                rows={2}
                placeholder={`Guidance for the next ${LEVEL_LABELS[level]} generation…`}
                value={levelSubprompt}
                onChange={(e) => setLevelSubprompt(e.target.value)}
              />
              <div className="save-row">
                <div className="tooltip-wrap">
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={savingLevel}
                    onClick={async () => {
                      setSavingLevel(true);
                      try { await onLevelSubpromptSave(levelSubprompt); } finally { setSavingLevel(false); }
                    }}
                  >
                    {savingLevel ? '…' : '💾 Save'}
                  </button>
                  <span className="tooltip-tip">
                    POST /api/admin/candidates/:wordId/subprompt {`{"field":"level","levelId":"${level}"}`}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LevelTabs({
  wordId, roundId, images, levels,
  selectedImageId, selectedLevels, subpromptLevels, initialImageSubprompt,
  onImageSelect, onFieldSelect, onImageSubpromptSave, onLevelSubpromptSave,
}: Props) {
  const [activeLevel, setActiveLevel] = useState<LevelId>('preK');

  // Group images by their derived level
  const imagesByLevel = new Map<LevelId, ImageCandidate[]>();
  for (const img of images) {
    const lvl = imageLevelId(img);
    if (lvl) {
      if (!imagesByLevel.has(lvl)) imagesByLevel.set(lvl, []);
      imagesByLevel.get(lvl)!.push(img);
    }
  }

  return (
    <div className="level-tabs-bar">
      {/* Tab header */}
      <div className="level-tabs-header">
        {LEVEL_IDS.map((level) => (
          <button
            key={level}
            className={`level-tab ${activeLevel === level ? 'active' : ''}`}
            onClick={() => setActiveLevel(level)}
          >
            {level}
            <span className="level-tab-sublabel">{LEVEL_SUBLABELS[level]}</span>
          </button>
        ))}
      </div>

      {/* Active panel */}
      {LEVEL_IDS.map((level) => (
        <div
          key={level}
          style={{ display: activeLevel === level ? 'block' : 'none' }}
          className="level-panel"
        >
          <LevelPanel
            level={level}
            wordId={wordId}
            roundId={roundId}
            levelImages={imagesByLevel.get(level) ?? []}
            candidates={levels[level] ?? []}
            sel={selectedLevels[level]}
            initialSubprompt={subpromptLevels[level] ?? ''}
            initialImgSubprompt={initialImageSubprompt}
            selectedImageId={selectedImageId}
            onImageSelect={onImageSelect}
            onFieldSelect={(field, idx) => onFieldSelect(level, field, idx)}
            onLevelSubpromptSave={(text) => onLevelSubpromptSave(level, text)}
            onImageSubpromptSave={onImageSubpromptSave}
          />
        </div>
      ))}
    </div>
  );
}
