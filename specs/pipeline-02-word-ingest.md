# Word Ingest

## Goal
Provide a predictable way to submit new words for generation in daily batches.

## Inputs
- A JSON batch file in the private repo:
  - Path: `inputs/word-batches/YYYY-MM-DD.json`
  - Each entry includes `word`, required `levels`, and optional metadata.

### Batch File Shape
```json
{
  "roundId": "2026-02-01",
  "words": [
    { "word": "empathy", "levels": ["preschooler", "kindergartener"], "partOfSpeech": "noun", "syllables": 3, "tags": ["feelings"] },
    { "word": "rocket", "levels": ["preschooler", "kindergartener", "first grader"], "partOfSpeech": "noun", "syllables": 2, "tags": ["space"] }
  ]
}
```

Allowed values for `levels` (each word must include at least one):
- `"preschooler"`
- `"kindergartener"`
- `"first grader"`

These match the audience levels expected by the prompt template in `scripts/generate-images.py`.

## Validation Rules
- Word is lowercase alpha or hyphenated (normalize to slug).
- Required fields: `word`, `levels`. Optional: `partOfSpeech`, `syllables`, `tags`.
- `levels` must be a non-empty array; each element must be one of: `"preschooler"`, `"kindergartener"`, `"first grader"`.
- Reject if already present in public app `src/core/words.ts`.
- Reject if already present in candidate store for any round.

## Cadence
- Default: daily schedule (GitHub Actions cron).
- Manual trigger supported via workflow dispatch to run specific batch.

## Outputs
- New `WordCandidate` records are created in the private repo round folder.
- Status set to `pending`.

## Acceptance Criteria
- Ingest job processes a batch file and creates candidate records.
- Duplicate and already-published words are skipped with a log entry.

