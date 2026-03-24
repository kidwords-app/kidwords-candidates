import type {
  CandidateRepository,
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

  // ── Write (stubbed — will be implemented with POST endpoints) ─────────────────

  async saveSelections(_roundId: string, _wordId: string, _selections: Selections): Promise<void> {
    throw new Error('GitHubCandidateRepository.saveSelections: not yet implemented');
  }

  async saveSubprompt(_roundId: string, _wordId: string, _input: SubpromptInput): Promise<void> {
    throw new Error('GitHubCandidateRepository.saveSubprompt: not yet implemented');
  }

  async setStatus(_roundId: string, _wordId: string, _status: WordStatus): Promise<void> {
    throw new Error('GitHubCandidateRepository.setStatus: not yet implemented');
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
