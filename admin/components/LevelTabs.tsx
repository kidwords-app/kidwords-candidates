'use client';

import { useState } from 'react';
import type { ImageCandidate, LevelCandidate, LevelId, FieldSelection } from '@/lib/types';
import {
  effectiveImageIdForLevel,
  imageLevelId,
  isSharedImage,
  LEVEL_LABELS,
} from '@/lib/imageLevel';

interface Props {
  wordId:               string;
  roundId:              string;
  images:               ImageCandidate[];
  levels:               Partial<Record<LevelId, LevelCandidate[]>>;
  selectedImageId:      string | undefined;
  selectedImageIdsByLevel: Partial<Record<LevelId, string>>;
  selectedLevels:       Partial<Record<LevelId, FieldSelection>>;
  onImageSelect:        (level: LevelId, imageId: string) => void;
  onFieldSelect:        (level: LevelId, field: keyof FieldSelection, idx: number) => void;
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

function LevelPanel({
  level, wordId, roundId,
  levelImages, candidates, sel,
  selectedImageId, selectedImageIdsByLevel, useSharedImages,
  onImageSelect, onFieldSelect,
}: {
  level:               LevelId;
  wordId:              string;
  roundId:             string;
  levelImages:         ImageCandidate[];
  candidates:          LevelCandidate[];
  sel:                 FieldSelection | undefined;
  selectedImageId:     string | undefined;
  selectedImageIdsByLevel: Partial<Record<LevelId, string>>;
  useSharedImages:     boolean;
  onImageSelect:       (imageId: string) => void;
  onFieldSelect:       (field: keyof FieldSelection, idx: number) => void;
}) {
  const levelImagePick = effectiveImageIdForLevel(
    level,
    useSharedImages,
    selectedImageId,
    selectedImageIdsByLevel,
  );

  return (
    <div className="level-two-col">
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
              selected={levelImagePick === img.imageId}
              onSelect={() => onImageSelect(img.imageId)}
            />
          ))
        )}
      </div>

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
          FIELDS.map((field) => (
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
          ))
        )}
      </div>
    </div>
  );
}

export default function LevelTabs({
  wordId, roundId, images, levels,
  selectedImageId, selectedImageIdsByLevel, selectedLevels,
  onImageSelect, onFieldSelect,
}: Props) {
  const [activeLevel, setActiveLevel] = useState<LevelId>('preK');

  const sharedImages = images.filter(isSharedImage);
  const useSharedImages = sharedImages.length > 0;

  const imagesByLevel = new Map<LevelId, ImageCandidate[]>();
  for (const img of images) {
    if (useSharedImages) continue;
    const lvl = imageLevelId(img);
    if (lvl) {
      if (!imagesByLevel.has(lvl)) imagesByLevel.set(lvl, []);
      imagesByLevel.get(lvl)!.push(img);
    }
  }

  return (
    <div className="level-tabs-bar">
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
            levelImages={useSharedImages ? sharedImages : (imagesByLevel.get(level) ?? [])}
            candidates={levels[level] ?? []}
            sel={selectedLevels[level]}
            selectedImageId={selectedImageId}
            selectedImageIdsByLevel={selectedImageIdsByLevel}
            useSharedImages={useSharedImages}
            onImageSelect={(imageId) => onImageSelect(level, imageId)}
            onFieldSelect={(field, idx) => onFieldSelect(level, field, idx)}
          />
        </div>
      ))}
    </div>
  );
}
