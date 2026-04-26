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
3. **Copies cartoon PNGs** from `candidates/rounds/{roundId}/assets/{wordId}/…` to
   `kidwords-web/public/cartoons/{preK|K|G1}/{wordId}.png` in repo `kidwords.github.io` (via GitHub Contents API),
   once per grade in the candidate’s selection. `scripts/generate-images.py` produces **one shared illustration** per run
   (a single scene concept + soft pastel style) and **level-specific** definition / example / tryIt text. Assets are typically
   `shared-*.png`; legacy `preschooler-` / `kindergartener-` / `first grader-` filenames are still supported. Publish picks the file
   for each grade using `admin/lib/imageLevel.ts` and `scripts/publish.py` heuristics, plus optional `selected.imageIdsByLevel`.
   The `kidwords-web` segment is configurable (`PUBLIC_APP_SUBDIR`) for monorepo layouts.
4. **Upserts** the word into `kidwords-web/src/core/words-data.json` in the same repo.
   That file is always a JSON object **`{ "words": [ ... ] }`**: the `words` array holds
   `WordEntry` objects sorted alphabetically by `cartoonId` (with backward compatibility
   for legacy rows that used `wordId` instead of `cartoonId` inside each entry).
5. **Pushes directly to `main`** — no PR is opened. The approval step in the admin
   UI is the human review gate; a second PR would be redundant. Vercel deploys
   automatically on push to `main`.

### WordEntry shape

**Source of truth:** the `WordEntry` / `LevelCopy` types in the **kidwords-web** repo (the app that consumes `words-data.json`).  
This pipeline must emit exactly that JSON shape — no extra keys (`wordId`, `imageUrl`, `roundId`, `publishedAt`, etc.).

```json
{
  "word":         "empathy",
  "partOfSpeech": "noun",
  "syllables":    3,
  "tags":         ["emotions"],
  "cartoonId":    "empathy",
  "levels": {
    "preK": { "definition": "...", "example": "...", "tryIt": "..." },
    "K":    { "definition": "...", "example": "...", "tryIt": "..." },
    "G1":   { "definition": "...", "example": "...", "tryIt": "..." }
  }
}
```

`cartoonId` matches the basename of each published PNG: `public/cartoons/preK/{cartoonId}.png`, `public/cartoons/K/{cartoonId}.png`, and `public/cartoons/G1/{cartoonId}.png` for levels in the selection (same slug as `wordId` in the candidates repo). The web app should resolve per grade, e.g. `/cartoons/preK/{cartoonId}.png`; native builds can mirror that layout in `imageMap`.

**Current invariant:** `cartoonId := wordId` during publish. Keep this as a 1:1 mapping unless the app type contract changes to support independent content IDs vs asset IDs.

Inside the `kidwords-web` app package, the bundle reads `src/core/words-data.json` (see `src/core/words.ts`). The file must expose the list as **`data.words`**, not a top-level JSON array.

### Contract / drift prevention

- **Implementations:** `scripts/publish.py` defines Pydantic models `WordEntry` and `LevelCopy` with `extra="forbid"`. Any new field must be added in **kidwords-web** first, then mirrored here and in this spec.
- **Tests:** `scripts/tests/test_publish.py` asserts each entry under `words` matches the public `WordEntry` keys (including `cartoonId`).
- **Optional:** Periodically diff this spec block against kidwords-web’s `WordEntry` type, or add a shared JSON Schema in a common package if the repos are merged later.

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

- Publish **commits directly to `main`** in the public app repo (GitHub Contents API). **No pull request** is opened for these changes; admin approval is the review gate.
- Vercel deploys automatically on push to `main` in the public repo.
- Rollback by reverting the commit on `main` (or re-publishing a corrected candidate).

## Acceptance Criteria
- `POST /api/admin/candidates/:wordId/publish` (and round publish, when used) triggers the correct workflow with `wordId` and `roundId`.
- The workflow validates the word before writing anything to the public repo.
- The resulting **commit on `main`** updates `words-data.json` (under `kidwords-web` as configured) and the published cartoon PNGs — not a PR branch.
- Validation errors surface in the GitHub Actions log with a clear message.
- New words appear in the public app after the workflow finishes and Vercel deploys.
