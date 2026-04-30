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

export function isSharedImage(img: ImageCandidate): boolean {
  const filename = img.assetPath.split('/').pop() ?? '';
  return filename.startsWith('shared-');
}

/** Images shown for a grade tab: shared pool, or assets tagged to that level. */
export function imagesForLevelTab(images: ImageCandidate[], level: LevelId): ImageCandidate[] {
  const shared = images.filter(isSharedImage);
  if (shared.length > 0) return shared;
  return images.filter((img) => imageLevelId(img) === level);
}

/** When not using shared art, map a legacy single `imageId` onto the grade it belongs to (if any). */
export function inferImageIdsByLevelFromLegacy(
  images: ImageCandidate[],
  legacyImageId: string | undefined,
): Partial<Record<LevelId, string>> {
  if (!legacyImageId || images.some(isSharedImage)) return {};
  const out: Partial<Record<LevelId, string>> = {};
  for (const img of images) {
    if (img.imageId !== legacyImageId) continue;
    const lvl = imageLevelId(img);
    if (lvl) out[lvl] = legacyImageId;
  }
  return out;
}

export function effectiveImageIdForLevel(
  level: LevelId,
  useSharedImages: boolean,
  imageId: string | undefined,
  imageIdsByLevel: Partial<Record<LevelId, string>> | undefined,
): string | undefined {
  if (useSharedImages) return imageId;
  return imageIdsByLevel?.[level];
}

export function levelHasChosenImage(
  level: LevelId,
  useSharedImages: boolean,
  imageId: string | undefined,
  imageIdsByLevel: Partial<Record<LevelId, string>> | undefined,
  images: ImageCandidate[],
): boolean {
  const id = effectiveImageIdForLevel(level, useSharedImages, imageId, imageIdsByLevel);
  if (!id) return false;
  return imagesForLevelTab(images, level).some((img) => img.imageId === id);
}

export const LEVEL_LABELS: Record<LevelId, string> = {
  preK: 'Pre-K',
  K:    'Kindergarten',
  G1:   '1st Grade',
};
