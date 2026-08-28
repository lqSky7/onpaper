# Zed IDE Adapter for OnPaper

## Capability Mapping
- **State Restoration**: Launch `onpaper restore` at the beginning of the chat or task context.
- **File Exploration**: Native workspace file search and buffer inspection.
- **Exercise Directory**: Manage temporary exercise files in `.interview-prep/exercises/`.
- **Command Execution**: Run validation commands via terminal or local task runner.
- **Prompt Presentation**: Present lessons and structured rubrics in the assistant panel.

## Operational Lifecycle
1. Run `onpaper restore` to inspect current project status and active session.
2. If reviews are due, prompt the student for spaced recall before teaching new files.
3. Conduct 2-3 interview questions, then invoke `onpaper submit-answers`.
4. Create temporary coding exercises with `onpaper create-exercise`.
5. When complete, invoke `onpaper submit-exercise` and ensure durable cleanup.
