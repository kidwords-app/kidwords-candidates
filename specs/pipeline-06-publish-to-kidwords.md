# Publish to Kidwords (Public)

## Goal
Move approved content from private candidate storage to the public Kidwords app.

## Publish Workflow

Publish is **intentionally separate from approval.** The admin approves words
individually during review. Publishing is a deliberate action that pushes
approved content to the public repo, either per-word or for an entire round.

### Triggers
- `POST /api/admin/candidates/:wordId/publish` — publish a single approved word.
- `POST /api/admin/rounds/:roundId/publish` — publish all `approved` words in a round.

Both endpoints delegate to `WorkflowClient.triggerPublish()` or
`WorkflowClient.triggerRoundPublish()`. See `pipeline-04b-backend-architecture.md`
for the interface and provider implementations.

### What the workflow does
- Validates that each word has a selected image and a selected definition,
  example, and try-it for all three levels (preK / K / G1).
- Converts each approved `WordCandidate` to `WordEntry` format for `src/core/words.ts`.
- Copies the selected image asset to the public repo at `public/cartoons/{wordId}.png`.
  In the GitHub implementation this is a direct file write via the GitHub API.
  In the AWS implementation this is an S3 copy from `kidwords-candidates` to
  `kidwords-public`.
- Opens a PR in the public repo for final review and merge.

## Validation
- Ensure each word has:
  - Selected image
  - Selected definition for each level ("preK", "K", "G1")
- Validate word uniqueness against `WORDS`.
- Run `npm run ci` in the PR for typecheck, tests, build.

## Deploy
- On PR merge, Vercel deploys automatically.
- Rollback by reverting the PR if issues are found.

## Acceptance Criteria
- Approved candidates can be published in a single workflow.
- New words appear in the public app after merge/deploy.

