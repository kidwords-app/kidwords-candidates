# Ops and Secrets

## Secrets
- `GEMINI_API_KEY`
- `CLAUDE_API_KEY` or `OPENAI_API_KEY`
- `CANDIDATE_REPO_TOKEN`
- `PUBLIC_REPO_TOKEN` (if separate from candidate repo token)
- `ADMIN_BASIC_AUTH` (hosting layer secret)

## Logging
- Append JSONL entries to `audit/actions-log.jsonl` in the private repo.
- Include: `roundId`, `wordId`, action, status, duration, error (if any).

## Cost Controls
- Default max words per run: 25
- Default max images per word: 3
- Default max definition candidates per level: 2
- Fail fast if quota errors occur.

## Alerts
- GitHub Actions should fail with explicit error messages.
- Optional: notify via email or Slack webhook (future enhancement).

## Acceptance Criteria
- Secrets are never written to repo files or logs.
- Workflow logs provide enough context to diagnose failures.

