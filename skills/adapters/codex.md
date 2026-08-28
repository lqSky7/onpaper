# Codex IDE Adapter for OnPaper

## Capability Mapping
- **State Recovery**: Execute `onpaper restore` prior to generating any new explanations.
- **Source Inspection**: Native workspace filesystem tools.
- **Exercise Management**: Constrained to `.interview-prep/exercises/`.
- **Durable Grading**: Transact all grade updates via `onpaper submit-exercise`.
- **Cloud Sync**: Outbox synchronization via `onpaper sync`.

## Workflow Rules
1. Never guess the curriculum; always adhere to the active unit returned by `onpaper restore`.
2. Grade strictly according to the 20-point interview rubric and 100-point coding rubric.
3. Automatically delete temporary exercise files only after confirmation of SQLite durable commit.
