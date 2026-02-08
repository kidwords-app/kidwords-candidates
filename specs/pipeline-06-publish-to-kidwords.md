# Publish to Kidwords (Public)

## Goal
Move approved content from private candidate storage to the public Kidwords app.

## Publish Workflow
- Trigger: manual GitHub Actions workflow dispatch (admin-approved batch).
- Reads approved `WordCandidate` entries.
- Converts each approved word to `WordEntry` format in `src/core/words.ts`.
- Copies selected image assets into the public repo `public/cartoons/`.
- Opens a PR in the public repo for review and merge.

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

