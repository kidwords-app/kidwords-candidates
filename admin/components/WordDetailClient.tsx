'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { WordCandidate, LevelId, FieldSelection, WordStatus } from '@/lib/types';
import LevelTabs from './LevelTabs';
import RegenPanel from './RegenPanel';

const STATUS_LABELS: Record<WordStatus, string> = {
  pending:     'pending',
  in_review:   'in review',
  approved:    'approved',
  needs_regen: 'needs regen',
};

interface Toast { id: number; msg: string; type: 'success' | 'error' | 'info' }

export default function WordDetailClient({ word: initial }: { word: WordCandidate }) {
  const router = useRouter();

  const [word,       setWord]       = useState<WordCandidate>(initial);
  const [regenOpen,  setRegenOpen]  = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [approving,  setApproving]  = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toasts,     setToasts]     = useState<Toast[]>([]);

  // Local selection state (mirrors word.selected, optimistically updated)
  const [selectedImageId, setSelectedImageId] = useState<string | undefined>(word.selected.imageId);
  const [selectedLevels,  setSelectedLevels]  = useState(word.selected.levels ?? {});

  function addToast(msg: string, type: Toast['type'] = 'info') {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }

  function handleImageSelect(imageId: string) {
    setSelectedImageId(imageId);
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
      const res = await fetch(`/api/admin/candidates/${word.wordId}/select`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ roundId: word.roundId, imageId: selectedImageId, levels: selectedLevels }),
      });
      if (!res.ok) throw new Error(await res.text());
      setWord((w) => ({ ...w, selected: { imageId: selectedImageId, levels: selectedLevels } }));
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
                <span className="meta-chip">📚 preK · K · G1</span>
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
                    disabled={approving}
                  >
                    {approving ? '…' : '✓ Approve'}
                  </button>
                  <span className="tooltip-tip">POST /api/admin/candidates/:wordId/approve</span>
                </div>
              ) : (
                <div className="tooltip-wrap">
                  <button
                    className="btn btn-teal"
                    onClick={handlePublish}
                    disabled={publishing}
                  >
                    {publishing ? '…' : '🚀 Publish'}
                  </button>
                  <span className="tooltip-tip">POST /api/admin/candidates/:wordId/publish</span>
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
    </>
  );
}
