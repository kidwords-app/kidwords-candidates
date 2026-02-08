# Admin Review UI

## Goal
Provide a private, basic-auth-protected interface to review and approve
candidates without exposing them publicly.

## Access Control
- Basic auth at the hosting layer (e.g., Vercel password protection).
- No candidate data is bundled into the public build.

## UI Pages
1) **Word List**
   - Filter by round, status (pending/in_review/approved).
   - Quick summary of candidate counts.
2) **Word Detail**
   - Image candidates (select one).
   - Definition candidates for each level (select one per level).
   - Sub-prompt input per word and per level.
   - Buttons: "Save", "Approve", "Regenerate".

## Data Access Strategy
- Admin UI calls server-side API endpoints (not client-side GitHub API).
- Server-side endpoints use `CANDIDATE_REPO_TOKEN` to read/write the
  private repo via GitHub API.

### Proposed Endpoints
- `GET /api/admin/candidates?roundId=...`
- `GET /api/admin/candidates/:wordId`
- `POST /api/admin/candidates/:wordId/select`
- `POST /api/admin/candidates/:wordId/subprompt`
- `POST /api/admin/candidates/:wordId/regenerate`

## Acceptance Criteria
- Admin can list words and view candidate details.
- Admin can select best image and best definitions for each level.
- Admin can add a sub-prompt to request better candidates.

