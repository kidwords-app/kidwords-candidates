import type { ImageCandidate, LevelId } from './types';

/**
 * The generate-images script names files with a level-persona prefix, e.g.
 *   preschooler-64fd2fd536.png   → preK
 *   kindergartener-1d89ba95a4.png → K
 *   first grader-cd100579b7.png  → G1
 *
 * When an ImageCandidate has an explicit `level` field we use that; otherwise
 * we derive it by matching the filename prefix.
 */
const PERSONA_TO_LEVEL: Record<string, LevelId> = {
  preschooler:   'preK',
  kindergartener: 'K',
  'first grader': 'G1',
};

export function imageLevelId(img: ImageCandidate): LevelId | undefined {
  if (img.level) return img.level;
  const filename = img.assetPath.split('/').pop() ?? '';
  for (const [persona, level] of Object.entries(PERSONA_TO_LEVEL)) {
    if (filename.startsWith(persona)) return level;
  }
  return undefined;
}

export const LEVEL_LABELS: Record<LevelId, string> = {
  preK: 'Pre-K',
  K:    'Kindergarten',
  G1:   '1st Grade',
};
