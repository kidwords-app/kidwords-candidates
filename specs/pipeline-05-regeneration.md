# Regeneration Rules

## Goal
Allow admins to request improved candidates per word or per level.

## Regeneration Modes
1) **Immediate**
   - Trigger GitHub Actions workflow dispatch from admin UI.
   - Regenerates only the affected assets (image or level definitions).
2) **Next Cadence**
   - Mark word as `needs_regen` and generate on next scheduled run.

## Sub-Prompt Handling
- Sub-prompts are stored per word and per level.
- Sub-prompt is appended to the base prompt template.
- Once used, the sub-prompt is cleared unless the admin keeps it.

## Acceptance Criteria
- Admin can trigger immediate or next-cadence regeneration.
- Only the targeted assets are regenerated.
- Sub-prompts are tracked and consumed deterministically.

