# Admin Review UI

## Goal

Provide a private, basic-auth-protected interface to review and approve
candidates without exposing them publicly.

## UI Reference

See `mockups/mockup-c-sidebar-dashboard.html` for the approved interactive
mockup. Open it directly in a browser — no build step required.

Key design decisions reflected in the mockup:
- Sidebar navigation for round and status filtering.
- Two-column word detail: image candidates on the left, level definitions on the right.
- Per-field mix-and-match selection (definition, example, try-it chosen independently).
- Inline regeneration panel with two distinct flows (image-only vs. text + image).
- Approve and publish are separate actions.

## Access Control

- Basic auth at the hosting layer (e.g., Vercel password protection).
- No candidate data is bundled into the public build.

## UI Pages

1. **Word List**
  - Filter by round, status (pending/in_review/approved).
  - Quick summary of candidate counts.
2. **Word Detail**
  - Image candidates (select one).
  - Definition candidates for each level: **definition, example, and try-it fields are
    selected independently** — the admin can mix and match fields from different
    model attempts.
  - Sub-prompt input per word and per level.
  - Buttons: "Save Selections", "Approve", "Regenerate ▾".
  - **Regenerate** expands an inline panel with two distinct flows:
    - *Image only* — replace the image prompt outright, or append a sub-prompt to
      the existing one. Queues an image generation job only.
    - *Text + Image* — regenerate definition/example/try-it for selected levels,
      then queue a new image generation job once text is finalized. Existing
      candidates are preserved until the admin approves new ones.

## Data Access Strategy

- Admin UI calls server-side API endpoints (not client-side GitHub API).
- Server-side endpoints use `CANDIDATE_REPO_TOKEN` to read/write the
private repo via GitHub API.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/admin/candidates?roundId=...` | List words, optionally filtered by round |
| `GET`  | `/api/admin/candidates/:wordId` | Fetch a word with all image and level candidates |
| `POST` | `/api/admin/candidates/:wordId/select` | Persist selections for image and/or per-level fields |
| `POST` | `/api/admin/candidates/:wordId/subprompt` | Save a sub-prompt for the image or a specific level |
| `POST` | `/api/admin/candidates/:wordId/approve` | Set word status to `approved` (does **not** publish) |
| `POST` | `/api/admin/candidates/:wordId/regenerate` | Queue a generation job (see body below) |
| `POST` | `/api/admin/rounds/:roundId/publish` | Publish all `approved` words in a round to the public app |
| `POST` | `/api/admin/candidates/:wordId/publish` | Publish a single approved word to the public app |

**Approve and publish are intentionally separate.** The admin reviews and approves
individual words at their own pace. Publishing is a deliberate batch action —
either per-word or for an entire round — that pushes content to the public repo.
See `pipeline-06-publish-to-kidwords.md` and `pipeline-04b-backend-architecture.md`.

#### `select` request body
```json
{
  "imageId": "img_xk72ms",
  "levels": {
    "preK": { "definition": 0, "example": 1, "tryIt": 0 },
    "K":    { "definition": 0, "example": 0, "tryIt": 1 },
    "G1":   { "definition": 2, "example": 0, "tryIt": 0 }
  }
}
```
Field indices refer to the position in the `levels[levelId]` candidate array for
that field. Each field (definition, example, tryIt) is selected independently.

#### `subprompt` request body
```json
{ "field": "image", "text": "warmer colors, more cheerful expressions" }
{ "field": "level", "levelId": "preK", "text": "use simpler words" }
```

#### `regenerate` request body
```json
{ "type": "image",  "mode": "replace",   "prompt": "..." }
{ "type": "image",  "mode": "subprompt", "subprompt": "..." }
{ "type": "full",   "levels": ["preK","K","G1"], "subprompt": "..." }
```
- `type: "image"` — regenerates image candidates only; text definitions unchanged.
- `type: "full"` — regenerates text candidates for the specified levels, then
  queues a new image generation job once text is complete.

## Acceptance Criteria

- Admin can list words filtered by round and status.
- Admin can select the best image candidate for a word.
- Admin can independently select the best definition, example, and try-it from
  any candidate attempt for each level (preK / K / G1).
- Admin can save a sub-prompt for the image or for a specific level.
- Admin can regenerate image candidates only (with a new or appended prompt).
- Admin can regenerate text + image candidates for selected levels.
- Admin can approve a word (sets status to `approved`; does not publish).
- Admin can publish a single approved word or all approved words in a round.
- Selections and sub-prompts are persisted without requiring approval.

