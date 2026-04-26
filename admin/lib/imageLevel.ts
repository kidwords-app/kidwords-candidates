import type { ImageCandidate, LevelId } from './types';

/**
 * The generate-images script may name files:
 * - Legacy (one PNG per level): preschooler-*.png → preK, kindergartener-*.png → K, first grader-*.png → G1
 * - Current (one shared illustration): shared-*.png — no level in the filename; use explicit `level` if set.
 *
 * When an ImageCandidate has an explicit `level` field we use that; otherwise
 * we derive it by matching the legacy filename prefix.
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
