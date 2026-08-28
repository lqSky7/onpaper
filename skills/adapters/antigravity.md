# Antigravity IDE Adapter for OnPaper

## Capability Mapping
- **State Discovery**: Run `onpaper restore` in the terminal or task execution layer.
- **Repository Exploration**: Bounded file views (`view_file`), ripgrep searches (`grep_search`), directory listings (`list_dir`).
- **File Management**: Manage temporary exercises using `write_to_file` and `replace_file_content` inside `.interview-prep/exercises/`.
- **Command Execution**: Execute `onpaper` CLI subcommands using `run_command`.
- **User Prompts**: Direct chat interface for technical lessons and interview questions.

## Startup Protocol
1. On each chat invocation, run `onpaper restore`.
2. Inspect returned JSON for `nextAction`, `dueCardsCount`, and `nextUnit`.
3. If `dueCardsCount > 0`, present due FSRS review questions first.
4. Otherwise, follow the session state machine to teach the next unit.
