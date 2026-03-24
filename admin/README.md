# KidWords Admin

Next.js admin portal for reviewing and approving word candidates.
Runs on port 3100. Lives in the `kidwords-candidates` repo.

## Setup

```bash
cd admin
npm install
cp .env.local.example .env.local
```

## Running locally

### With mock data (no token required)

`.env.local` ships with `PROVIDER=mock`. Just:

```bash
npm run dev
```

The app starts at [http://localhost:3100](http://localhost:3100).
All data comes from `lib/providers/mock/mock-data.ts` — the same
dataset used in the UI mockup.

### With live GitHub data

Edit `.env.local`:

```
PROVIDER=github
CANDIDATES_REPO_TOKEN=ghp_your_fine_grained_token
```

The token needs `Contents: Read` permission on `kidwords-candidates`.

Then `npm run dev` as normal.

## API endpoints (GET only, for now)

| Endpoint | Example |
|---|---|
| List all words | `GET /api/admin/candidates` |
| Filter by round | `GET /api/admin/candidates?roundId=2026-03-03` |
| Filter by status | `GET /api/admin/candidates?status=in_review` |
| Word detail | `GET /api/admin/candidates/empathy?roundId=2026-03-03` |

Quick curl test:

```bash
curl "http://localhost:3100/api/admin/candidates?roundId=2026-03-03" | jq '.words[].wordId'
curl "http://localhost:3100/api/admin/candidates/empathy?roundId=2026-03-03" | jq '{wordId, status, images: (.images | length)}'
```

## Tests

```bash
npm test           # run once
npm run test:watch # watch mode
```

24 tests across:
- `__tests__/unit/GitHubCandidateRepository.test.ts` — fetch mocking, path construction, error handling
- `__tests__/integration/candidates-list.test.ts` — GET /api/admin/candidates
- `__tests__/integration/candidates-detail.test.ts` — GET /api/admin/candidates/:wordId
