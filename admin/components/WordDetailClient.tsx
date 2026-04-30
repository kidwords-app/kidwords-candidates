'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { WordCandidate, LevelId, FieldSelection, WordStatus } from '@/lib/types';
import { inferImageIdsByLevelFromLegacy, isSharedImage, levelHasChosenImage } from '@/lib/imageLevel';
import LevelTabs from './LevelTabs';
import RegenPanel from './RegenPanel';

const LEVEL_IDS: LevelId[] = ['preK', 'K', 'G1'];
const LEVEL_LABELS: Record<LevelId, string> = { preK: 'preK', K: 'K', G1: 'G1' };

function isLevelComplete(levelId: LevelId, selected: WordCandidate['selected']): boolean {
  const sel = selected.levels?.[levelId];
  if (!sel) return false;
  return sel.definition !== undefined && sel.example !== undefined && sel.tryIt !== undefined;
}

/** True if persisted selections include an image choice and/or any level field picks. */
function hasSomeSavedSelection(selected: WordCandidate['selected']): boolean {
  if (selected.imageId) return true;
  const byLevelImg = selected.imageIdsByLevel;
  if (byLevelImg) {
    for (const id of Object.values(byLevelImg)) {
      if (id) return true;
    }
  }
  const levels = selected.levels;
  if (!levels) return false;
  for (const sel of Object.values(levels)) {
    if (!sel) continue;
    if (
      sel.definition !== undefined ||
      sel.example !== undefined ||
      sel.tryIt !== undefined
    ) {
      return true;
    }
  }
  return false;
}

function useSharedImagesFromList(images: WordCandidate['images']): boolean {
  return (images ?? []).filter(isSharedImage).length > 0;
}

function primaryImageIdForPayload(
  useShared: boolean,
  global: string | undefined,
  byLevel: Partial<Record<LevelId, string>>,
): string | undefined {
  if (useShared) return global;
  for (const l of LEVEL_IDS) {
    if (byLevel[l]) return byLevel[l];
  }
  return undefined;
}

const STATUS_LABELS: Record<WordStatus, string> = {
  pending:     'pending',
  in_review:   'in review',
  approved:    'approved',
  needs_regen: 'needs regen',
};

interface Toast { id: number; msg: string; type: 'success' | 'error' | 'info' }

export default function WordDetailClient({ word: initial }: { word: WordCandidate }) {
  const router = useRouter();

  const [word,               setWord]               = useState<WordCandidate>(initial);
  const [regenOpen,          setRegenOpen]          = useState(false);
  const [saving,             setSaving]             = useState(false);
  const [approving,          setApproving]          = useState(false);
  const [publishing,         setPublishing]         = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [toasts,             setToasts]             = useState<Toast[]>([]);

  const initShared = useSharedImagesFromList(initial.images);
  const initInferredByLevel = !initShared
    ? inferImageIdsByLevelFromLegacy(initial.images ?? [], initial.selected.imageId)
    : {};

  // Local selection state (mirrors word.selected, optimistically updated)
  const [selectedImageId, setSelectedImageId] = useState<string | undefined>(() =>
    initShared ? initial.selected.imageId : undefined,
  );
  const [selectedImageIdsByLevel, setSelectedImageIdsByLevel] = useState<
    Partial<Record<LevelId, string>>
  >(() => ({
    ...initial.selected.imageIdsByLevel,
    ...initInferredByLevel,
  }));
  const [selectedLevels, setSelectedLevels] = useState(initial.selected.levels ?? {});

  const useSharedImages = useSharedImagesFromList(word.images);

  // Publish readiness is based on the *saved* state (word.selected), not local picks
  const levelReadiness = LEVEL_IDS.map((l) => ({ level: l, complete: isLevelComplete(l, word.selected) }));
  const imageReadiness = LEVEL_IDS.map((l) => ({
    level: l,
    complete: levelHasChosenImage(
      l,
      useSharedImages,
      word.selected.imageId,
      word.selected.imageIdsByLevel,
      word.images ?? [],
    ),
  }));
  const canPublish =
    word.status === 'approved' &&
    imageReadiness.every((x) => x.complete) &&
    levelReadiness.every((l) => l.complete);
  const canApprove = hasSomeSavedSelection(word.selected);

  function addToast(msg: string, type: Toast['type'] = 'info') {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }

  function handleImageSelect(level: LevelId, imageId: string) {
    if (useSharedImages) {
      setSelectedImageId(imageId);
      setSelectedImageIdsByLevel({});
    } else {
      setSelectedImageIdsByLevel((prev) => ({ ...prev, [level]: imageId }));
    }
  }

  function handleFieldSelect(level: LevelId, field: keyof FieldSelection, idx: number) {
    setSelectedLevels((prev) => ({
      ...prev,
      [level]: { ...(prev[level] ?? {}), [field]: idx },
    }));
  }

  async function handleSaveSelections() {
    setSaving(true);
    try {
      const shared = useSharedImagesFromList(word.images);
      const primary = primaryImageIdForPayload(shared, selectedImageId, selectedImageIdsByLevel);
      const levelsPayload = { ...word.selected.levels, ...selectedLevels };
      const body: Record<string, unknown> = {
        roundId: word.roundId,
        levels:  levelsPayload,
      };
      if (primary) body.imageId = primary;
      if (!shared && Object.keys(selectedImageIdsByLevel).length > 0) {
        body.imageIdsByLevel = selectedImageIdsByLevel;
      }

      const res = await fetch(`/api/admin/candidates/${word.wordId}/select`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());

      setWord((w) => {
        const mergedByLevel = shared ? {} : { ...w.selected.imageIdsByLevel, ...selectedImageIdsByLevel };
        const nextSel = { ...w.selected, levels: levelsPayload };
        if (primary) nextSel.imageId = primary;
        if (shared) {
          delete nextSel.imageIdsByLevel;
        } else if (Object.keys(mergedByLevel).length > 0) {
          nextSel.imageIdsByLevel = mergedByLevel;
        }
        return { ...w, selected: nextSel };
      });
      addToast('Selections saved', 'success');
    } catch {
      addToast('Failed to save selections', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    try {
      const res = await fetch(`/api/admin/candidates/${word.wordId}/approve`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ roundId: word.roundId }),
      });
      if (!res.ok) throw new Error(await res.text());
      setWord((w) => ({ ...w, status: 'approved' }));
      addToast('Word approved ✓', 'success');
    } catch {
      addToast('Failed to approve', 'error');
    } finally {
      setApproving(false);
    }
  }

  async function handlePublish() {
    setShowPublishConfirm(false);
    setPublishing(true);
    try {
      const res = await fetch(`/api/admin/candidates/${word.wordId}/publish`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ roundId: word.roundId }),
      });
      if (!res.ok) throw new Error(await res.text());
      addToast('Publish workflow triggered ✓', 'success');
    } catch {
      addToast('Failed to trigger publish', 'error');
    } finally {
      setPublishing(false);
    }
  }

  const handleImageSubpromptSave = useCallback(async (text: string) => {
    const res = await fetch(`/api/admin/candidates/${word.wordId}/subprompt`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ roundId: word.roundId, field: 'image', text }),
    });
    if (!res.ok) throw new Error(await res.text());
    setWord((w) => ({ ...w, subPrompts: { ...w.subPrompts, image: text } }));
    addToast('Image sub-prompt saved', 'success');
  }, [word.wordId, word.roundId]);

  const handleLevelSubpromptSave = useCallback(async (level: LevelId, text: string) => {
    const res = await fetch(`/api/admin/candidates/${word.wordId}/subprompt`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ roundId: word.roundId, field: 'level', levelId: level, text }),
    });
    if (!res.ok) throw new Error(await res.text());
    setWord((w) => ({
      ...w,
      subPrompts: { ...w.subPrompts, levels: { ...w.subPrompts.levels, [level]: text } },
    }));
    addToast(`${level} sub-prompt saved`, 'success');
  }, [word.wordId, word.roundId]);

  return (
    <>
      {/* Top bar */}
      <div className="topbar">
        <div className="topbar-title">{word.word}</div>
        <button className="btn btn-outline btn-sm" onClick={() => router.push('/candidates')}>
          ← Back to list
        </button>
      </div>

      <div className="content-area">
        {/* Breadcrumb */}
        <div className="breadcrumb">
          <a className="bc-link" onClick={() => router.push('/candidates')}>Rounds</a>
          <span className="sep">/</span>
          <a className="bc-link" onClick={() => router.push(`/candidates?roundId=${word.roundId}`)}>{word.roundId}</a>
          <span className="sep">/</span>
          <span className="current">{word.word}</span>
        </div>

        {/* Header card */}
        <div className="detail-header">
          <div className="detail-header-top">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div className="detail-word">{word.word}</div>
                <span className={`status-pill pill-${word.status}`}>
                  {STATUS_LABELS[word.status]}
                </span>
              </div>
              <div className="detail-meta" style={{ marginTop: 10 }}>
                <span className="meta-chip">🏷 {word.partOfSpeech}</span>
                <span className="meta-chip">🔤 {word.syllables} syllables</span>
                {levelReadiness.map(({ level, complete }) => (
                  <span key={level} className={`level-status-chip ${complete ? 'complete' : 'incomplete'}`}>
                    {complete ? '✓' : '○'} {LEVEL_LABELS[level]}
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {word.tags.map((t) => (
                  <span key={t} className="tag-chip">{t}</span>
                ))}
                <span className="round-chip" style={{ marginLeft: 4 }}>round: {word.roundId}</span>
              </div>
            </div>

            <div className="action-bar">
              <div className="tooltip-wrap">
                <button
                  className="btn btn-outline"
                  onClick={handleSaveSelections}
                  disabled={saving}
                >
                  {saving ? '…' : '💾 Save Selections'}
                </button>
                <span className="tooltip-tip">POST /api/admin/candidates/:wordId/select</span>
              </div>

              {word.status !== 'approved' ? (
                <div className="tooltip-wrap">
                  <button
                    className="btn btn-teal"
                    onClick={handleApprove}
                    disabled={approving || !canApprove}
                  >
                    {approving ? '…' : '✓ Approve'}
                  </button>
                  <span className="tooltip-tip">
                    {canApprove
                      ? 'POST /api/admin/candidates/:wordId/approve'
                      : 'Save selections first — choose an image and/or at least one level field, then Save'}
                  </span>
                </div>
              ) : (
                <div className="tooltip-wrap">
                  <button
                    className="btn btn-teal"
                    onClick={() => setShowPublishConfirm(true)}
                    disabled={publishing || !canPublish}
                  >
                    {publishing ? '…' : '🚀 Publish'}
                  </button>
                  <span className="tooltip-tip">
                    {canPublish
                      ? 'POST /api/admin/candidates/:wordId/publish'
                      : (() => {
                          const missImg = imageReadiness.filter((x) => !x.complete).map((x) => x.level);
                          const missDef = levelReadiness.filter((l) => !l.complete).map((l) => l.level);
                          const parts: string[] = [];
                          if (missImg.length) parts.push(`image: ${missImg.join(', ')}`);
                          if (missDef.length) parts.push(`definitions: ${missDef.join(', ')}`);
                          return parts.length
                            ? `Complete all levels first — missing ${parts.join('; ')}`
                            : 'Complete all levels first';
                        })()}
                  </span>
                </div>
              )}

              <div className="tooltip-wrap">
                <button
                  className="btn btn-orange"
                  onClick={() => setRegenOpen((o) => !o)}
                >
                  ↻ Regenerate ▾
                </button>
                <span className="tooltip-tip">POST /api/admin/candidates/:wordId/regenerate</span>
              </div>
            </div>
          </div>
        </div>

        {/* Regen panel */}
        {regenOpen && (
          <RegenPanel
            wordId={word.wordId}
            roundId={word.roundId}
            onClose={() => setRegenOpen(false)}
            onQueued={(msg) => {
              setWord((w) => ({ ...w, status: 'needs_regen' }));
              addToast(msg, 'success');
            }}
          />
        )}

        {/* Level-first two-column layout */}
        <LevelTabs
          wordId={word.wordId}
          roundId={word.roundId}
          images={word.images ?? []}
          levels={word.levels}
          selectedImageId={selectedImageId}
          selectedImageIdsByLevel={selectedImageIdsByLevel}
          selectedLevels={selectedLevels}
          subpromptLevels={word.subPrompts.levels ?? {}}
          initialImageSubprompt={word.subPrompts.image ?? ''}
          onImageSelect={handleImageSelect}
          onFieldSelect={handleFieldSelect}
          onImageSubpromptSave={handleImageSubpromptSave}
          onLevelSubpromptSave={handleLevelSubpromptSave}
        />
      </div>

      {/* Toast container */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
        ))}
      </div>

      {/* Publish confirmation modal */}
      {showPublishConfirm && (
        <div className="modal-overlay" onClick={() => setShowPublishConfirm(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Publish &ldquo;{word.word}&rdquo;?</div>
              <button className="modal-close" onClick={() => setShowPublishConfirm(false)}>✕</button>
            </div>
            <p className="modal-body-text">
              This triggers the publish workflow. The following content will go live:
            </p>
            <div className="modal-publish-summary">
              <div className="modal-summary-image">
                <span className="modal-summary-label">Image(s)</span>
                <span className="modal-summary-value">
                  {useSharedImages
                    ? (word.selected.imageId ?? '—')
                    : LEVEL_IDS.map((l) => {
                        const id =
                          word.selected.imageIdsByLevel?.[l] ?? word.selected.imageId;
                        return `${LEVEL_LABELS[l]}: ${id ?? '—'}`;
                      }).join(' · ')}
                </span>
              </div>
              {LEVEL_IDS.map((level) => {
                const sel  = word.selected.levels?.[level];
                const candidates = word.levels[level] ?? [];
                const def  = sel !== undefined ? candidates[sel.definition]?.definition : undefined;
                return (
                  <div key={level} className="modal-summary-level">
                    <span className="modal-summary-label">{LEVEL_LABELS[level]}</span>
                    <span className="modal-summary-value">
                      {def ? `"${def.length > 80 ? def.slice(0, 80) + '…' : def}"` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowPublishConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-teal" onClick={handlePublish} disabled={publishing}>
                {publishing ? '…' : '🚀 Confirm Publish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
