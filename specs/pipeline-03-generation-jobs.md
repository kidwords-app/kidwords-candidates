# Generation Jobs (GitHub Actions)

## Goal
Generate candidate definitions and images for each word in a batch, and support admin-triggered regeneration of one word at a time.

## Script
All generation runs through **`scripts/generate-word-image.py`** (Gemini text + image). The script supports:

| Mode | How invoked | Behavior |
|------|-------------|----------|
| **Batch** | No `--word-id`; `--round-id` + `--candidates-repo` | Reads `inputs/word-batches/<roundId>.json`; for each word runs the definition-first pipeline and writes/updates `WordCandidate` JSON + assets. |
| **Image regen** | `--word-id` + `--regen-mode replace\|subprompt` | Appends one new image using a replacement prompt or sub-prompt inserted before `Output:` in `images[0].prompt`. |
| **Full regen** | `--word-id` + `--regen-mode full` + `--regen-levels` | Re-runs teaching scenario → level text → scene → image for selected levels (`preK`, `K`, `G1`); optional `--regen-subprompt` guides stage 1. |

Pipeline order (batch and full regen): teaching scenario → per-level definition/example/tryIt/speak → scene derived from level text → one shared cartoon (`shared-*.png`).

## Workflow: `generate-word.yaml`

- **Repo:** workflow file lives in `kidwords-app/kidwords-candidates`; checkout uses `CANDIDATES_REPO_TOKEN` and runs Python in that repo.
- **Triggers:**
  - **Cron** daily (`0 6 * * *`) — batch for today’s UTC `roundId` unless overridden.
  - **Manual dispatch** — optional `roundId` for batch; or admin regen with `wordId` + mode inputs.
- **Batch path** (no `wordId`): `python scripts/generate-word-image.py` with env `ROUND_ID`, `CANDIDATES_REPO_PATH`.
- **Regen path** (`wordId` set): same script with `--word-id`, `--regen-mode`, `--regen-prompt`, `--regen-subprompt`, `--regen-levels` (full only).
- **Commit:** pushes changes under `candidates/rounds/` back to the candidates repo.

### Workflow dispatch inputs

| Input | Batch | Image regen | Full regen |
|-------|-------|-------------|------------|
| `roundId` | optional (default today UTC) | required (from admin) | required |
| `wordId` | omit | required | required |
| `mode` | omit | `replace` \| `subprompt` | `full` |
| `prompt` | — | replace prompt | — |
| `subprompt` | — | image sub-prompt | optional text guidance |
| `levels` | — | — | comma-separated `preK,K,G1` |

## Admin regeneration

The moderation app does **not** call Gemini directly. It:

1. `POST /api/admin/candidates/:wordId/regenerate` — sets status `needs_regen`, then dispatches `generate-word.yaml` via `GitHubWorkflowClient`.
2. **Image only:** `{ type: "image", mode: "replace"|"subprompt", prompt|subprompt, roundId }`.
3. **Full:** `{ type: "full", levels: ["preK","K","G1"], subprompt?, roundId }` → workflow `mode=full`, `levels=preK,K,...`.

On success the script sets status `in_review` and appends new `images[]` / `levels[]` entries (existing candidates are kept until a moderator selects winners).

## Batch inputs and outputs

- **Reads:** `inputs/word-batches/YYYY-MM-DD.json` (`words[]` with `word`, `levels`, optional `tags`, `partOfSpeech`).
- **Writes:**
  - `candidates/rounds/<roundId>/words/<wordId>.json`
  - `candidates/rounds/<roundId>/assets/<wordId>/shared-<id>.png`
- **Audience levels** in batch files use long names (`preschooler`, `kindergartener`, `first grader`); stored level keys are `preK`, `K`, `G1`.

## Secrets
- `GEMINI_API_KEY` — text and image generation
- `CANDIDATES_REPO_TOKEN` — PAT with read/write on the candidates repo (checkout + push)
- Optional SMTP secrets for failure/success email on workflow completion

## Calling LLM APIs from Actions
GitHub Actions runners call Gemini over HTTPS. Secrets are injected as env vars and must never be echoed in logs.

## Saving image assets
1. Decode model image bytes and write under `candidates/rounds/<roundId>/assets/<wordId>/`.
2. Append `ImageCandidate` with repo-relative `assetPath` (e.g. `candidates/rounds/.../shared-<id>.png`).
3. Commit and push in the workflow’s “Commit and push” step.

Notes:
- Prefer stable `imageId` (short uuid hex).
- Keep binaries in the private candidates repo; publish only selected images via `publish-word.yaml` / `scripts/publish.py`.

## Rate limits / retries
- Retry transient API failures in script (see `generate-word-image.py`).
- Batch size is whatever is in the day’s JSON file; cron fails cleanly if that file is missing.

## Acceptance criteria
- Batch workflow runs on schedule and manual trigger when a batch file exists.
- Admin image and full regen dispatch the same workflow with correct inputs.
- Generated assets and metadata land in the private repo and are visible in the admin UI.
