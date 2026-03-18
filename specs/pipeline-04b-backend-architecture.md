# Admin Backend Architecture

## Goal

Define a backend architecture for the admin portal that works with the current
GitHub-as-storage approach, but is structured so the storage and workflow layers
can be swapped for production-grade infrastructure (S3, DynamoDB, SQS, etc.)
without touching API route logic.

## Guiding principle

**API routes are dumb coordinators.** They validate input, call repository/client
methods, and return responses. They know nothing about GitHub, S3, or DynamoDB.
All I/O is injected through interfaces.

---

## Provider Interfaces

Three interfaces cover all external I/O. Every API route depends only on these
contracts.

### `CandidateRepository`

Reads and writes word candidate data (the JSON blobs).

```typescript
interface CandidateRepository {
  listWords(filter?: {
    roundId?: string;
    status?: WordStatus;
  }): Promise<WordCandidate[]>;

  getWord(roundId: string, wordId: string): Promise<WordCandidate>;

  saveSelections(
    roundId: string,
    wordId: string,
    selections: Selections
  ): Promise<void>;

  saveSubprompt(
    roundId: string,
    wordId: string,
    subprompt: SubpromptInput
  ): Promise<void>;

  setStatus(
    roundId: string,
    wordId: string,
    status: WordStatus
  ): Promise<void>;
}
```

### `AssetRepository`

Reads candidate image assets and writes approved assets to the publish target.

```typescript
interface AssetRepository {
  // Read a raw image asset from candidate storage
  getImageAsset(
    roundId: string,
    wordId: string,
    imageId: string
  ): Promise<Buffer>;

  // Write a selected image to the publish destination
  // Returns the public URL or path of the published asset
  putPublishedAsset(
    wordId: string,
    imageId: string,
    data: Buffer
  ): Promise<string>;
}
```

### `WorkflowClient`

Triggers background generation and publish jobs.

```typescript
interface WorkflowClient {
  triggerRegeneration(
    wordId: string,
    roundId: string,
    options: RegenOptions
  ): Promise<void>;

  triggerPublish(
    wordId: string,
    roundId: string
  ): Promise<void>;

  triggerRoundPublish(
    roundId: string
  ): Promise<void>;
}
```

---

## Shared Types

```typescript
type WordStatus = 'pending' | 'in_review' | 'approved' | 'needs_regen';
type LevelId    = 'preK' | 'K' | 'G1';

interface FieldSelection {
  definition: number; // index into LevelCandidate[] for this level
  example:    number;
  tryIt:      number;
}

interface Selections {
  imageId?: string;
  levels?:  Partial<Record<LevelId, FieldSelection>>;
}

type SubpromptInput =
  | { field: 'image'; text: string }
  | { field: 'level'; levelId: LevelId; text: string };

type RegenOptions =
  | { type: 'image'; mode: 'replace';   prompt: string }
  | { type: 'image'; mode: 'subprompt'; subprompt: string }
  | { type: 'full';  levels: LevelId[]; subprompt?: string };
```

---

## Implementations

### v1 — GitHub (current / development)

| Interface             | Implementation                    | Mechanism                              |
|-----------------------|-----------------------------------|----------------------------------------|
| `CandidateRepository` | `GitHubCandidateRepository`       | GitHub Contents API (read/write JSON)  |
| `AssetRepository`     | `GitHubAssetRepository`           | GitHub Contents API (read binary) + GitHub Contents API write to public repo |
| `WorkflowClient`      | `GitHubWorkflowClient`            | `workflow_dispatch` via GitHub Actions API |

All three use `CANDIDATES_REPO_TOKEN`. The publish path additionally uses
`PUBLIC_REPO_TOKEN` to write into the public app repo.

```
providers/
  github/
    GitHubCandidateRepository.ts
    GitHubAssetRepository.ts
    GitHubWorkflowClient.ts
    github-client.ts          ← shared Octokit instance + retry logic
```

### v2 — AWS (production)

| Interface             | Implementation                  | Mechanism                                  |
|-----------------------|---------------------------------|--------------------------------------------|
| `CandidateRepository` | `DynamoCandidateRepository`     | DynamoDB table: `word-candidates`          |
| `AssetRepository`     | `S3AssetRepository`             | S3: `kidwords-candidates` + `kidwords-public` buckets |
| `WorkflowClient`      | `SQSWorkflowClient`             | SQS queue → Lambda / Step Functions       |

```
providers/
  aws/
    DynamoCandidateRepository.ts
    S3AssetRepository.ts
    SQSWorkflowClient.ts
    aws-clients.ts             ← shared AWS SDK clients
```

Switching from v1 to v2 requires only changing which implementations are
injected at the composition root — no API route code changes.

---

## Composition Root

Implementations are wired together in one place, controlled by an environment
variable:

```typescript
// lib/providers.ts
import { GitHubCandidateRepository } from './providers/github/GitHubCandidateRepository';
import { GitHubAssetRepository }     from './providers/github/GitHubAssetRepository';
import { GitHubWorkflowClient }      from './providers/github/GitHubWorkflowClient';

// Future swap:
// import { DynamoCandidateRepository } from './providers/aws/DynamoCandidateRepository';
// import { S3AssetRepository }         from './providers/aws/S3AssetRepository';
// import { SQSWorkflowClient }         from './providers/aws/SQSWorkflowClient';

export const candidateRepo: CandidateRepository = new GitHubCandidateRepository({
  token: process.env.CANDIDATES_REPO_TOKEN!,
  owner: 'kidwords-app',
  repo:  'kidwords-candidates',
});

export const assetRepo: AssetRepository = new GitHubAssetRepository({
  candidatesToken: process.env.CANDIDATES_REPO_TOKEN!,
  publicToken:     process.env.PUBLIC_REPO_TOKEN!,
  owner: 'kidwords-app',
  candidatesRepo:  'kidwords-candidates',
  publicRepo:      'kidwords.github.io',
});

export const workflowClient: WorkflowClient = new GitHubWorkflowClient({
  token: process.env.CANDIDATES_REPO_TOKEN!,
  owner: 'kidwords-app',
  repo:  'kidwords-candidates',
});
```

---

## API Route Example

Routes stay thin and provider-agnostic:

```typescript
// app/api/admin/candidates/[wordId]/approve/route.ts
import { candidateRepo } from '@/lib/providers';

export async function POST(req: Request, { params }: { params: { wordId: string } }) {
  const { roundId } = await req.json();
  await candidateRepo.setStatus(roundId, params.wordId, 'approved');
  return Response.json({ ok: true });
}
```

```typescript
// app/api/admin/rounds/[roundId]/publish/route.ts
import { candidateRepo, assetRepo, workflowClient } from '@/lib/providers';

export async function POST(_req: Request, { params }: { params: { roundId: string } }) {
  await workflowClient.triggerRoundPublish(params.roundId);
  return Response.json({ ok: true });
}
```

---

## DynamoDB Schema (v2 reference)

```
Table: word-candidates
  PK:  wordId          (string)
  SK:  roundId         (string)
  Attributes: all WordCandidate fields as top-level attributes or a
              single `data` blob for the candidates arrays
  GSI: status-index    PK=status, SK=updatedAt  (for filtered list queries)
```

Image assets in S3:
```
kidwords-candidates/rounds/{roundId}/assets/{wordId}/{imageId}.png  ← private
kidwords-public/cartoons/{wordId}.png                               ← published
```

---

## File Structure (admin app)

```
admin/                          ← Next.js app (lives in this repo)
  app/
    api/
      admin/
        candidates/
          route.ts              ← GET list
          [wordId]/
            route.ts            ← GET detail
            select/route.ts
            subprompt/route.ts
            approve/route.ts
            regenerate/route.ts
            publish/route.ts
        rounds/
          [roundId]/
            publish/route.ts
  lib/
    providers.ts                ← composition root
    types.ts                    ← shared interfaces + domain types
    providers/
      github/
        GitHubCandidateRepository.ts
        GitHubAssetRepository.ts
        GitHubWorkflowClient.ts
        github-client.ts
      aws/                      ← stubbed, ready to fill in
        DynamoCandidateRepository.ts
        S3AssetRepository.ts
        SQSWorkflowClient.ts
        aws-clients.ts
  components/                   ← UI components
  app/
    (admin)/                    ← protected route group
      page.tsx                  ← word list
      [wordId]/
        page.tsx                ← word detail
```

---

## Acceptance Criteria

- All API routes depend only on the three interfaces; no direct GitHub/AWS SDK
  calls outside of `providers/`.
- Swapping from GitHub to AWS requires only changes to `lib/providers.ts` and
  the files under `lib/providers/aws/` — zero changes to API routes or UI.
- Approve and publish are separate operations; a word can be approved without
  being published.
- The `publish` endpoints (per-word and per-round) delegate to `WorkflowClient`;
  they do not directly write to the public repo.
