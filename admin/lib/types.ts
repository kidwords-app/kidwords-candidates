// ─── Domain types ──────────────────────────────────────────────────────────────

export type WordStatus = 'pending' | 'in_review' | 'approved' | 'needs_regen';
export type LevelId    = 'preK' | 'K' | 'G1';
export type ModelId    = 'claude' | 'chatgpt' | 'gemini';

export interface LevelCandidate {
  definition: string;
  example:    string;
  tryIt:      string;
  speak?:     string;
  model:      'claude' | 'chatgpt';
  score?:     number;
}

export interface ImageCandidate {
  imageId:   string;
  prompt:    string;
  model:     'gemini';
  assetPath: string;
  createdAt: string;
  /** Optional explicit level. When absent, derived from the assetPath prefix. */
  level?:    LevelId;
}

/** Per-level field selections: each field independently points to a candidate index. */
export interface FieldSelection {
  definition: number;
  example:    number;
  tryIt:      number;
}

export interface Selections {
  imageId?: string;
  /** When set, overrides which ImageCandidate is published for each grade (optional). */
  imageIdsByLevel?: Partial<Record<LevelId, string>>;
  levels?:  Partial<Record<LevelId, FieldSelection>>;
}

export interface SubpromptMap {
  image?:  string;
  levels?: Partial<Record<LevelId, string>>;
}

export interface WordCandidate {
  wordId:      string;
  word:        string;
  partOfSpeech: string;
  syllables:   number;
  tags:        string[];
  roundId:     string;
  status:      WordStatus;
  levels:      Record<LevelId, LevelCandidate[]>;
  images:      ImageCandidate[];
  selected:    Selections;
  subPrompts:  SubpromptMap;
  createdAt:   string;
  updatedAt:   string;
}

// ─── Provider interfaces ────────────────────────────────────────────────────────

export type SubpromptInput =
  | { field: 'image'; text: string }
  | { field: 'level'; levelId: LevelId; text: string };

export type RegenOptions =
  | { type: 'image'; mode: 'replace';   prompt: string }
  | { type: 'image'; mode: 'subprompt'; subprompt: string }
  | { type: 'full';  levels: LevelId[]; subprompt?: string };

export interface CandidateRepository {
  listWords(filter?: { roundId?: string; status?: WordStatus }): Promise<WordCandidate[]>;
  getWord(roundId: string, wordId: string): Promise<WordCandidate>;
  saveSelections(roundId: string, wordId: string, selections: Selections): Promise<void>;
  saveSubprompt(roundId: string, wordId: string, input: SubpromptInput): Promise<void>;
  setStatus(roundId: string, wordId: string, status: WordStatus): Promise<void>;
}

export interface AssetRepository {
  /** assetPath is the full relative path from the candidate JSON, e.g.
   *  candidates/rounds/2026-03-03/assets/prioritize/preschooler-64fd2fd536.png */
  getImageAsset(assetPath: string): Promise<Buffer>;
  putPublishedAsset(wordId: string, imageId: string, data: Buffer): Promise<string>;
}

export interface WorkflowClient {
  triggerRegeneration(wordId: string, roundId: string, options: RegenOptions): Promise<void>;
  triggerPublish(wordId: string, roundId: string): Promise<void>;
  triggerRoundPublish(roundId: string): Promise<void>;
}

// ─── Errors ────────────────────────────────────────────────────────────────────

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ProviderError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
