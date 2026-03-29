'use client';

import { useState } from 'react';
import type { ImageCandidate } from '@/lib/types';

interface Props {
  wordId:          string;
  roundId:         string;
  images:          ImageCandidate[];
  selectedImageId: string | undefined;
  onSelect:        (imageId: string) => void;
  onSubpromptSave: (text: string) => Promise<void>;
  initialSubprompt?: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

  return (
    <div>
      <div className="col-label">🖼 Image Candidates</div>

      {images.map((img, i) => (
        <div
          key={img.imageId}
          className={`img-card ${selectedImageId === img.imageId ? 'selected' : ''}`}
          onClick={() => onSelect(img.imageId)}
        >
          <div className="img-placeholder">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/admin/candidates/${wordId}/image/${img.imageId}?roundId=${roundId}`}
              alt={img.prompt}
              onError={(e) => {
                const t = e.currentTarget;
                t.style.display = 'none';
                t.parentElement!.querySelector<HTMLElement>('.img-fallback')!.style.display = 'flex';
              }}
            />
            <span className="img-fallback" style={{ display: 'none', fontSize: 32, color: 'var(--text-3)' }}>
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
              checked={selectedImageId === img.imageId}
              onChange={() => onSelect(img.imageId)}
            />
            <label htmlFor={`img-${img.imageId}`}>
              {selectedImageId === img.imageId ? '✓ Selected' : `Select image ${i + 1}`}
            </label>
          </div>
        </div>
      ))}

      {/* Image sub-prompt */}
      <div className="subprompt-section" style={{ marginTop: 16 }}>
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
