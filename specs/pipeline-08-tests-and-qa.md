# Tests and QA

## Goal
Ensure pipeline correctness and prevent publishing invalid content.

## Testing Layers
1) **Unit tests**
   - Word candidate schema validation.
   - Transform logic from `WordCandidate` to `WordEntry`.
2) **Workflow tests**
   - Dry-run mode for Actions that generates sample output.
3) **Admin UI tests**
   - List view renders candidates.
   - Selecting image/definitions updates state.

## Manual QA Checklist
- Run a test batch with 1-2 words.
- Verify images and definitions appear in private repo.
- Approve and publish; validate public app renders correctly.

## Acceptance Criteria
- Automated tests cover data validation and transformation.
- Manual QA steps documented for release validation.

