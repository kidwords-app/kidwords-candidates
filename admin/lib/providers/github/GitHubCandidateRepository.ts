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
import { makeGitHubClient, type GitHubConfig } from './github-client';

const ROUNDS_PATH  = 'candidates/rounds';
const WORDS_SUBDIR = 'words';

export class GitHubCandidateRepository implements CandidateRepository {
  private readonly gh: ReturnType<typeof makeGitHubClient>;

  constructor(config: GitHubConfig) {
    this.gh = makeGitHubClient(config);
  }

  // ── Read ─────────────────────────────────────────────────────────────────────

  async listWords(filter?: { roundId?: string; status?: WordStatus }): Promise<WordCandidate[]> {
    const rounds = filter?.roundId
      ? [filter.roundId]
      : await this.listRoundIds();

    // Fetch all rounds in parallel
    const perRound = await Promise.all(rounds.map(r => this.listWordsInRound(r)));
    const all = perRound.flat();

    return filter?.status ? all.filter(w => w.status === filter.status) : all;
  }

  async getWord(roundId: string, wordId: string): Promise<WordCandidate> {
    try {
      return await this.gh.fetchJson<WordCandidate>(
        `${ROUNDS_PATH}/${roundId}/${WORDS_SUBDIR}/${wordId}.json`,
      );
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new NotFoundError(`Word not found: ${wordId} in round ${roundId}`);
      }
      throw err;
    }
  }

  // ── Write ────────────────────────────────────────────────────────────────────

  async saveSelections(roundId: string, wordId: string, selections: Selections): Promise<void> {
    await this.patchWord(roundId, wordId, (word) => {
      if (selections.imageId !== undefined) {
        word.selected.imageId = selections.imageId;
      }
      if (selections.levels) {
        word.selected.levels ??= {};
        for (const [level, fields] of Object.entries(selections.levels) as [LevelId, FieldSelection][]) {
          word.selected.levels[level] = { ...word.selected.levels[level], ...fields };
        }
      }
    }, `admin: update selections for ${wordId}`);
  }

  async saveSubprompt(roundId: string, wordId: string, input: SubpromptInput): Promise<void> {
    await this.patchWord(roundId, wordId, (word) => {
      if (input.field === 'image') {
        word.subPrompts.image = input.text;
      } else {
        word.subPrompts.levels ??= {};
        word.subPrompts.levels[input.levelId] = input.text;
      }
    }, `admin: update subprompt for ${wordId}`);
  }

  async setStatus(roundId: string, wordId: string, status: WordStatus): Promise<void> {
    await this.patchWord(
      roundId, wordId,
      (word) => { word.status = status; },
      `admin: set status to ${status} for ${wordId}`,
    );
  }

  // ── Private write helper ───────────────────────────────────────────────────

  /**
   * Read-modify-write a word JSON file atomically (within a single request).
   * The mutator receives the current WordCandidate and modifies it in place.
   * updatedAt is always set before writing back.
   */
  private async patchWord(
    roundId:  string,
    wordId:   string,
    mutate:   (word: WordCandidate) => void,
    message:  string,
  ): Promise<void> {
    const path = `${ROUNDS_PATH}/${roundId}/${WORDS_SUBDIR}/${wordId}.json`;
    const { data: word, sha } = await this.gh.fetchJsonWithSha<WordCandidate>(path);
    mutate(word);
    word.updatedAt = new Date().toISOString();
    await this.gh.putJson(path, word, sha, message);
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private async listRoundIds(): Promise<string[]> {
    const items = await this.gh.listDirectory(ROUNDS_PATH);
    return items.filter(i => i.type === 'dir').map(i => i.name);
  }

  private async listWordsInRound(roundId: string): Promise<WordCandidate[]> {
    const path  = `${ROUNDS_PATH}/${roundId}/${WORDS_SUBDIR}`;
    const items = await this.gh.listDirectory(path);
    const files = items.filter(i => i.type === 'file' && i.name.endsWith('.json'));

    // Fetch word files in parallel
    return Promise.all(
      files.map(f => {
        const wordId = f.name.replace(/\.json$/, '');
        return this.getWord(roundId, wordId);
      }),
    );
  }
}
