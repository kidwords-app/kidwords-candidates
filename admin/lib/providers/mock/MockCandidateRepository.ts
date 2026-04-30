import type {
  CandidateRepository,
  FieldSelection,
  LevelId,
  Selections,
  SubpromptInput,
  WordCandidate,
  WordStatus,
} from '@/lib/types';
import { NotFoundError } from '@/lib/types';
import { MOCK_WORDS } from './mock-data';

/**
 * In-memory CandidateRepository backed by the same dataset as the UI mockup.
 * Used in tests (via vi.mock) and local dev when PROVIDER=mock.
 * Mutations are applied to an in-memory copy — they do not persist across
 * process restarts.
 */
export class MockCandidateRepository implements CandidateRepository {
  private words: WordCandidate[];

  constructor(seed: WordCandidate[] = MOCK_WORDS) {
    // Deep-copy so mutations in one test don't bleed into others
    this.words = JSON.parse(JSON.stringify(seed));
  }

  async listWords(filter?: { roundId?: string; status?: WordStatus }): Promise<WordCandidate[]> {
    let results = this.words;
    if (filter?.roundId) results = results.filter(w => w.roundId === filter.roundId);
    if (filter?.status)  results = results.filter(w => w.status  === filter.status);
    return results;
  }

  async getWord(roundId: string, wordId: string): Promise<WordCandidate> {
    const word = this.words.find(w => w.wordId === wordId && w.roundId === roundId);
    if (!word) throw new NotFoundError(`Word not found: ${wordId} in round ${roundId}`);
    return word;
  }

  async saveSelections(roundId: string, wordId: string, selections: Selections): Promise<void> {
    const word = await this.getWord(roundId, wordId);
    if (selections.imageId !== undefined) {
      word.selected.imageId = selections.imageId;
    }
    if (selections.imageIdsByLevel) {
      word.selected.imageIdsByLevel ??= {};
      for (const [level, id] of Object.entries(selections.imageIdsByLevel) as [LevelId, string][]) {
        if (id) word.selected.imageIdsByLevel[level] = id;
      }
    }
    if (selections.levels) {
      word.selected.levels ??= {};
      for (const [level, fields] of Object.entries(selections.levels) as [LevelId, FieldSelection][]) {
        word.selected.levels[level] = { ...word.selected.levels[level], ...fields };
      }
    }
    word.updatedAt = new Date().toISOString();
  }

  async saveSubprompt(roundId: string, wordId: string, input: SubpromptInput): Promise<void> {
    const word = await this.getWord(roundId, wordId);
    if (input.field === 'image') {
      word.subPrompts.image = input.text;
    } else {
      word.subPrompts.levels ??= {};
      word.subPrompts.levels[input.levelId] = input.text;
    }
    word.updatedAt = new Date().toISOString();
  }

  async setStatus(roundId: string, wordId: string, status: WordStatus): Promise<void> {
    const word = await this.getWord(roundId, wordId);
    word.status    = status;
    word.updatedAt = new Date().toISOString();
  }
}
