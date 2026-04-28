'use client';

import { useState } from 'react';
import type { ImageCandidate, LevelId } from '@/lib/types';
import { imageLevelId, isSharedImage, LEVEL_LABELS } from '@/lib/imageLevel';

interface Props {
  wordId:          string;
  roundId:         string;
  images:          ImageCandidate[];
  selectedImageId: string | undefined;
  onSelect:        (imageId: string) => void;
  onSubpromptSave: (text: string) => Promise<void>;
  initialSubprompt?: string;
}

const LEVEL_ORDER: LevelId[] = ['preK', 'K', 'G1'];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ImageCard({
  img,
  wordId,
  roundId,
  selected,
  onSelect,
}: {
  img:     ImageCandidate;
  wordId:  string;
  roundId: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={`img-card ${selected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      <div className="img-placeholder">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/admin/candidates/${wordId}/image/${img.imageId}?roundId=${roundId}`}
          alt={img.prompt}
          onError={(e) => {
            const t = e.currentTarget;
            t.style.display = 'none';
            const fallback = t.parentElement?.querySelector<HTMLElement>('.img-fallback');
            if (fallback) fallback.style.display = 'flex';
          }}
        />
        <span
          className="img-fallback"
          style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', fontSize: 32, color: 'var(--text-3)' }}
        >
          🖼
        </span>
        <span className="img-id-overlay">{img.imageId}</span>
      </div>

      <div className="img-card-body">
        <div className="img-prompt">{img.prompt}</div>
        <div className="img-card-footer">
          <span className="model-badge">{img.model}</span>
          <span className="card-date">{fmtDate(img.createdAt)}</span>
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
        <label htmlFor={`img-${img.imageId}`}>
          {selected ? '✓ Selected' : 'Select this image'}
        </label>
      </div>
    </div>
  );
}

export default function ImagePanel({
  wordId,
  roundId,
  images,
  selectedImageId,
  onSelect,
  onSubpromptSave,
  initialSubprompt = '',
}: Props) {
  const [subprompt, setSubprompt] = useState(initialSubprompt);
  const [saving,    setSaving]    = useState(false);

  async function handleSaveSubprompt() {
    setSaving(true);
    try {
      await onSubpromptSave(subprompt);
    } finally {
      setSaving(false);
    }
  }

  if (images.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '24px' }}>
        <div className="big-icon">🖼</div>
        <div>No image candidates yet.</div>
      </div>
    );
  }

  const sharedImages = images.filter(isSharedImage);
  const useSharedImages = sharedImages.length > 0;

  // Group images by their derived level; ungrouped images land in a fallback bucket.
  // Shared images always take precedence over level-specific images.
  const grouped = new Map<LevelId | 'other', ImageCandidate[]>();
  if (useSharedImages) {
    grouped.set('other', sharedImages);
  } else {
    for (const img of images) {
      const key = imageLevelId(img) ?? 'other';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(img);
    }
  }

  const orderedKeys: (LevelId | 'other')[] = [
    ...LEVEL_ORDER.filter((l) => grouped.has(l)),
    ...(grouped.has('other') ? (['other'] as const) : []),
  ];

  return (
    <div>
      <div className="col-label">🖼 Image Candidates</div>

      {orderedKeys.map((key) => (
        <div key={key} style={{ marginBottom: 20 }}>
          {/* Level header */}
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.07em',
            textTransform: 'uppercase',
            color: 'var(--text-3)',
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{ color: 'var(--text-2)' }}>
              {key === 'other' ? 'Untagged' : LEVEL_LABELS[key]}
            </span>
            <span style={{ fontSize: 10, background: '#f1f5f9', padding: '1px 6px', borderRadius: 99, color: 'var(--text-3)' }}>
              {key === 'other' ? key : key}
            </span>
          </div>

          {grouped.get(key)!.map((img) => (
            <ImageCard
              key={img.imageId}
              img={img}
              wordId={wordId}
              roundId={roundId}
              selected={selectedImageId === img.imageId}
              onSelect={() => onSelect(img.imageId)}
            />
          ))}
        </div>
      ))}

      {/* Image sub-prompt */}
      <div className="subprompt-section" style={{ marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <div className="subprompt-label">🎨 Image sub-prompt</div>
        <textarea
          className="subprompt-input"
          rows={3}
          placeholder="Add guidance for the next image generation run, e.g. 'warmer colors, outdoor setting'"
          value={subprompt}
          onChange={(e) => setSubprompt(e.target.value)}
        />
        <div className="save-row">
          <div className="tooltip-wrap">
            <button
              className="btn btn-outline btn-sm"
              onClick={handleSaveSubprompt}
              disabled={saving}
            >
              {saving ? '…' : '💾 Save sub-prompt'}
            </button>
            <span className="tooltip-tip">
              POST /api/admin/candidates/:wordId/subprompt {`{"field":"image"}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
