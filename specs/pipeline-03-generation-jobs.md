# Generation Jobs (GitHub Actions)

## Goal
Generate candidate images and definitions for each word in a batch.

## Workflows

### 1) `generate-images.yml`
- Trigger: cron daily + manual workflow dispatch with `roundId`.
- Runs in the public app repo, but reads/writes data in the private
  `kidwords-app/kidwords-candidates` repo.
- Reads: `inputs/word-batches/YYYY-MM-DD.json` for the round.
- For each word:
  - Build a prompt template with word, level, tags.
  - Call Gemini API for image candidates (N=3 default).
  - Save images to `candidates/rounds/<roundId>/assets/<wordId>/`.
  - Append image metadata to the word's `WordCandidate`.

### 2) `generate-definitions.yml`
- Trigger: cron daily + manual workflow dispatch with `roundId`.
- Reads the same batch file and word candidate records.
- For each word and each level:
  - Call Claude/ChatGPT for candidate definitions (N=2 default).
  - Store as `LevelCandidate` array per level.
  - Update `WordCandidate` status to `in_review` when both image and
    definition candidates exist.

## Prompt Template (Definition)
- Inputs: word, partOfSpeech, tags, levelId.
- Outputs: `definition`, `example`, `tryIt`.
- Constraints: short sentences; age-appropriate tone.

## Secrets
- `GEMINI_API_KEY`
- `CLAUDE_API_KEY` or `OPENAI_API_KEY`
- `CANDIDATES_REPO_TOKEN` (PAT or GitHub App token for private repo access)

## Calling LLM APIs from Actions
GitHub Actions runners can call external HTTPS APIs. Secrets are injected as
env vars and must never be echoed in logs.

### Minimal Example (definition call)
```yaml
name: llm-smoke-test
on:
  workflow_dispatch:
jobs:
  call-llm:
    runs-on: ubuntu-latest
    steps:
      - name: Call OpenAI
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          curl https://api.openai.com/v1/responses \
            -H "Authorization: Bearer $OPENAI_API_KEY" \
            -H "Content-Type: application/json" \
            -d '{"model":"gpt-4.1-mini","input":"Define empathy for a 5-year-old."}'
```

### Minimal Example (Gemini image call)
```yaml
name: gemini-image-smoke-test
on:
  workflow_dispatch:
jobs:
  call-gemini:
    runs-on: ubuntu-latest
    steps:
      - name: Call Gemini image generation
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
        run: |
          curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$GEMINI_API_KEY" \
            -H "Content-Type: application/json" \
            -d '{
              "contents": [
                { "parts": [{ "text": "Generate a kid-friendly cartoon of a rocket in space." }] }
              ]
            }'
```

## Saving Image Assets
When the model returns base64 image data, the Action should:
1. Parse response JSON and extract the base64 payload.
2. Write the decoded bytes to
   `candidates/rounds/<roundId>/assets/<wordId>/<imageId>.png`.
3. Append a new `ImageCandidate` entry in the word's JSON with `assetPath`.
4. Commit and push changes to the private candidate repo.

Notes:
- Prefer stable `imageId` (uuid or short hash of prompt + timestamp).
- Keep binary assets out of the public repo; only publish selected images.
- If assets become large, switch to Git LFS in the private repo.

## Rate Limits / Retries
- Retry 2 times per request with exponential backoff.
- Batch size limit (default 25 words per run).
- Log failures to `audit/actions-log.jsonl`.

## Acceptance Criteria
- Workflows can run on schedule and on manual trigger.
- Generated assets and metadata are stored in the private repo.
- Failures are logged with wordId and roundId.

