# Publish to Kidwords (Public)

## Goal
Move approved content from private candidate storage to the public KidWords app repo.

## Publish Workflow

Publish is **intentionally separate from approval.** The admin approves words
individually during review. Publishing is a deliberate action that pushes
approved content to the public repo, either per-word or for an entire round.

### Triggers
- `POST /api/admin/candidates/:wordId/publish` — publish a single approved word.
- `POST /api/admin/rounds/:roundId/publish` — publish all `approved` words in a round.

Both endpoints call `WorkflowClient.triggerPublish()` or
`WorkflowClient.triggerRoundPublish()`. See `pipeline-04b-backend-architecture.md`
for the interface. The GitHub implementation dispatches:

| Action | Workflow |
|---|---|
| Single word | `.github/workflows/publish-word.yaml` |
| Entire round | `.github/workflows/publish-round.yaml` |

### What the workflow does

Both workflows call `scripts/publish.py`, which:

1. **Validates** the `WordCandidate` — status must be `approved`, image and per-level
   field selections must be complete (all three levels: preK / K / G1).
2. **Maps** the candidate to a `WordEntry` (see [WordEntry shape](#wordentry-shape)),
   respecting the mix-and-match field selections.
3. **Copies the selected image** from `candidates/rounds/{roundId}/assets/{wordId}/{imageId}.png`
   to `kidwords-web/public/cartoons/{wordId}.png` in repo `kidwords.github.io` (via GitHub Contents API).
   The `kidwords-web` segment is configurable (`PUBLIC_APP_SUBDIR`) for monorepo layouts.
4. **Upserts** the word into `kidwords-web/src/core/words-data.json` in the same repo
   (sorted alphabetically by `wordId`).
5. **Pushes directly to `main`** — no PR is opened. The approval step in the admin
   UI is the human review gate; a second PR would be redundant. Vercel deploys
   automatically on push to `main`.

### WordEntry shape

```json
{
  "wordId":       "empathy",
  "word":         "empathy",
  "partOfSpeech": "noun",
  "syllables":    3,
  "tags":         ["emotions"],
  "imageUrl":     "/cartoons/empathy.png",
  "roundId":      "2026-03-03",
  "publishedAt":  "2026-03-03T10:00:00+00:00",
  "levels": {
    "preK": { "definition": "...", "example": "...", "tryIt": "..." },
    "K":    { "definition": "...", "example": "...", "tryIt": "..." },
    "G1":   { "definition": "...", "example": "...", "tryIt": "..." }
  }
}
```

Inside the `kidwords-web` app package, the bundle reads `src/core/words-data.json` (see `src/core/words.ts`).

### GitHub secrets required

| Secret | Used by |
|---|---|
| `CANDIDATES_REPO_TOKEN` | Checkout the private candidates repo |
| `PUBLIC_REPO_TOKEN` | Write images + words-data.json to the public repo |
| `PUBLIC_REPO_NAME` | Default `kidwords.github.io` |
| `PUBLIC_APP_SUBDIR` | Default `kidwords-web` — app root inside that monorepo |
| `SMTP_*` / `NOTIFY_EMAIL_*` | Email notification on completion / failure |

## Validation

`validate_word_candidate()` in `scripts/publish.py` raises before touching the
public repo if any of the following are true:

- `status != "approved"`
- `selected.imageId` is missing or not present in the `images` array
- Any of preK / K / G1 missing from `selected.levels`
- Any level missing a `definition`, `example`, or `tryIt` index
- A selected index is out of range for its candidate list

## Testing

Unit and integration tests live in `scripts/tests/test_publish.py` (pytest).

```
pytest scripts/tests/test_publish.py -v
```

Coverage:
- `validate_word_candidate` — 7 cases including all error branches
- `map_to_word_entry` — verifies mix-and-match resolution and field structure
- `load_word_candidate` / `load_approved_words_in_round` — fs and error paths
- `load_image_bytes` — missing candidate and missing file errors
- `publish_word` — GitHub API calls, branch passing, upsert logic, no-duplicate

## Deploy

- Vercel deploys automatically on push to `main` in the public repo.
- Rollback by reverting the commit (or re-publishing a corrected candidate).

## Acceptance Criteria
- `POST /publish` triggers the correct workflow with `wordId` and `roundId`.
- Workflow validates the word before writing anything to the public repo.
- The PR contains the updated `words-data.json` and the image asset.
- Validation errors surface in the GitHub Actions log with a clear message.
- New words appear in the public app after merge and deploy.
