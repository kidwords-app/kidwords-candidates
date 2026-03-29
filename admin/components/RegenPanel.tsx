'use client';

import { useState } from 'react';
import type { LevelId } from '@/lib/types';

interface Props {
  wordId:   string;
  roundId:  string;
  onClose:  () => void;
  onQueued: (msg: string) => void;
}

const ALL_LEVELS: LevelId[] = ['preK', 'K', 'G1'];

export default function RegenPanel({ wordId, roundId, onClose, onQueued }: Props) {
  const [imgMode,       setImgMode]       = useState<'replace' | 'subprompt'>('replace');
  const [imgPrompt,     setImgPrompt]     = useState('');
  const [imgSubprompt,  setImgSubprompt]  = useState('');
  const [fullLevels,    setFullLevels]    = useState<Set<LevelId>>(new Set(ALL_LEVELS));
  const [fullSubprompt, setFullSubprompt] = useState('');
  const [queueingImg,   setQueueingImg]   = useState(false);
  const [queueingFull,  setQueueingFull]  = useState(false);

  function toggleLevel(level: LevelId) {
    setFullLevels((prev) => {
      const next = new Set(prev);
      next.has(level) ? next.delete(level) : next.add(level);
      return next;
    });
  }

  async function queueImageRegen() {
    setQueueingImg(true);
    try {
      const body = imgMode === 'replace'
        ? { roundId, type: 'image', mode: 'replace', prompt: imgPrompt }
        : { roundId, type: 'image', mode: 'subprompt', subprompt: imgSubprompt };
      const res = await fetch(`/api/admin/candidates/${wordId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      onQueued('Image regen queued');
      onClose();
    } catch {
      onQueued('Failed to queue regen');
    } finally {
      setQueueingImg(false);
    }
  }

  async function queueFullRegen() {
    if (fullLevels.size === 0) return;
    setQueueingFull(true);
    try {
      const res = await fetch(`/api/admin/candidates/${wordId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId,
          type: 'full',
          levels: [...fullLevels],
          subprompt: fullSubprompt || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      onQueued('Full regen queued');
      onClose();
    } catch {
      onQueued('Failed to queue regen');
    } finally {
      setQueueingFull(false);
    }
  }

  return (
    <div className="regen-panel">
      <div className="regen-panel-header">
        <div className="regen-panel-title">↻ What would you like to regenerate?</div>
        <button className="regen-close" onClick={onClose}>✕</button>
      </div>

      <div className="regen-cards">
        {/* Card A: Image only */}
        <div className="regen-card">
          <div className="regen-card-title">🖼 Image only</div>
          <div className="regen-card-desc">
            Keep the current text definitions. Generate new image candidates
            using either a replacement prompt or a sub-prompt added to the existing one.
          </div>

          <div className="regen-mode-row">
            <div
              className={`regen-mode-btn ${imgMode === 'replace' ? 'active' : ''}`}
              onClick={() => setImgMode('replace')}
            >
              Replace prompt
            </div>
            <div
              className={`regen-mode-btn ${imgMode === 'subprompt' ? 'active' : ''}`}
              onClick={() => setImgMode('subprompt')}
            >
              Add sub-prompt
            </div>
          </div>

          {imgMode === 'replace' ? (
            <textarea
              className="regen-textarea"
              rows={2}
              placeholder="e.g. 'Two children sharing an umbrella, warm pastel watercolor, age 4-6'"
              value={imgPrompt}
              onChange={(e) => setImgPrompt(e.target.value)}
            />
          ) : (
            <>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6, fontStyle: 'italic' }}>
                Will append to the existing image prompt
              </div>
              <textarea
                className="regen-textarea"
                rows={2}
                placeholder="e.g. 'warmer colors, more cheerful expressions'"
                value={imgSubprompt}
                onChange={(e) => setImgSubprompt(e.target.value)}
              />
            </>
          )}

          <div className="regen-footer">
            <div className="tooltip-wrap">
              <button
                className="btn btn-orange-solid btn-sm"
                onClick={queueImageRegen}
                disabled={queueingImg}
              >
                {queueingImg ? '…' : '↻ Queue image regen'}
              </button>
              <span className="tooltip-tip">
                POST /api/admin/candidates/:wordId/regenerate {`{"type":"image"}`}
              </span>
            </div>
          </div>
        </div>

        {/* Card B: Text + Image */}
        <div className="regen-card">
          <div className="regen-card-title">📝 Text definitions + Image</div>
          <div className="regen-card-desc">
            Regenerate all definition candidates for one or all levels.
            A new image will also be queued once the text prompt is finalized.
          </div>

          <div className="regen-warn">
            ⚠ This queues both a text generation job <em>and</em> an image generation job.
            Existing candidates are kept until you approve new ones.
          </div>

          <div style={{ marginBottom: 8 }}>
            <div className="subprompt-label" style={{ fontSize: 11, marginBottom: 5 }}>
              Levels to regenerate
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {ALL_LEVELS.map((level) => (
                <label key={level} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={fullLevels.has(level)}
                    onChange={() => toggleLevel(level)}
                  />
                  {level}
                </label>
              ))}
            </div>
          </div>

          <textarea
            className="regen-textarea"
            rows={2}
            placeholder="Optional: guidance for the text model (e.g. 'focus on classroom scenarios')"
            value={fullSubprompt}
            onChange={(e) => setFullSubprompt(e.target.value)}
          />

          <div className="regen-footer">
            <div className="tooltip-wrap">
              <button
                className="btn btn-orange-solid btn-sm"
                onClick={queueFullRegen}
                disabled={queueingFull || fullLevels.size === 0}
              >
                {queueingFull ? '…' : '↻ Queue full regen'}
              </button>
              <span className="tooltip-tip">
                POST /api/admin/candidates/:wordId/regenerate {`{"type":"full"}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
