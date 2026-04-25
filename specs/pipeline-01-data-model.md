# Pipeline Data Model

## Overview
Candidate state lives in a separate private GitHub repo (recommended). The
public app repo only receives approved data once moderation is complete.
This keeps raw candidates and assets out of the public codebase.

Repo names:
- Candidates repo (private): `kidwords-app/kidwords-candidates`
- Public site repo: `kidwords-app/kidwords.github.io` (app source under `kidwords-web/`)

## Entities

### WordCandidate
- `wordId`: slug (lowercase, hyphenated), e.g. "empathy"
- `word`: display text, e.g. "empathy"
- `partOfSpeech`: noun/verb/adjective/etc
- `syllables`: number
- `tags`: string[]
- `roundId`: batch identifier (e.g., "2026-02-01")
- `status`: pending | in_review | approved | needs_regen
- `selected`: { imageId?: string, levels?: Record<LevelId, LevelSelection> }
- `subPrompts`: { image?: string, levels?: Record<LevelId, string> }
- `createdAt` / `updatedAt`

### LevelCandidate
- `levelId`: "preK" | "K" | "G1"
- `definition`: string
- `example`: string
- `tryIt`: string
- `speak`: string (optional; can be set later)
- `model`: "claude" | "chatgpt"
- `score`: optional number for future ranking

### ImageCandidate
- `imageId`: unique id (uuid or hash)
- `prompt`: string
- `model`: "gemini"
- `assetPath`: path to image file in private repo
- `createdAt`

## JSON Shape (WordCandidate)
```json
{
  "wordId": "empathy",
  "word": "empathy",
  "partOfSpeech": "noun",
  "syllables": 3,
  "tags": ["feelings"],
  "roundId": "2026-02-01",
  "status": "in_review",
  "levels": {
    "preK": [
      { "definition": "...", "example": "...", "tryIt": "...", "model": "chatgpt" }
    ],
    "K": [
      { "definition": "...", "example": "...", "tryIt": "...", "model": "chatgpt" }
    ],
    "G1": [
      { "definition": "...", "example": "...", "tryIt": "...", "model": "chatgpt" }
    ]
  },
  "images": [
    { "imageId": "img_01", "prompt": "...", "model": "gemini", "assetPath": "assets/empathy/img_01.png" }
  ],
  "selected": {
    "imageId": "img_01",
    "levels": {
      "preK": { "index": 0 },
      "K": { "index": 0 },
      "G1": { "index": 0 }
    }
  },
  "subPrompts": {
    "image": "make it more playful",
    "levels": { "K": "simpler wording" }
  },
  "createdAt": "2026-02-01T00:00:00Z",
  "updatedAt": "2026-02-01T00:00:00Z"
}
```

## Storage Layout (private candidates repo)
```
/candidates/
  /rounds/
    /2026-02-01/
      /words/
        empathy.json
        rocket.json
      /assets/
        empathy/
          img_01.png
          img_02.png
/inputs/
  /word-batches/
    2026-02-01.json
/audit/
  actions-log.jsonl
```

## Repo Split and Permissions
The private candidates repo is the source of truth for inputs and candidates.
Only approved content is copied into the public app repo.

Access:
- Admin UI and generation workflows: read/write on private candidates repo.
- Publish workflow: read from candidates repo, write to public app repo.
- Public app: no access to candidates repo.

Recommended tokens:
- `CANDIDATES_REPO_TOKEN` with `contents: write` on candidates repo.
- `PUBLIC_REPO_TOKEN` with `contents: write` on public app repo.

## Mapping to Public App
When published, `WordCandidate` maps to `WordEntry` in the public app’s
`words-data.json` (see `pipeline-06-publish-to-kidwords.md`): `word`, `partOfSpeech`,
`syllables`, `tags`, `cartoonId` (same slug as candidate `wordId`), and `levels`
with `definition`, `example`, `tryIt` per level. The public shape is enforced in
`scripts/publish.py` via Pydantic and must match kidwords-web’s `WordEntry` type.

## Acceptance Criteria
- Data model supports multiple candidates per level and per image.
- Each word can track selections and sub-prompts independently.
- Storage layout is deterministic and easy to read/write from Actions.

