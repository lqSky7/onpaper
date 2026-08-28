# Antigravity IDE Adapter for OnPaper

## Capability Mapping
- **State Discovery**: Run `onpaper restore` in the terminal or task execution layer.
- **Project Preferences**: Prompt user for project-wide preferences (e.g. JavaScript syntax instead of TypeScript) and store via `onpaper config set-instructions`.
- **Repository Exploration**: Bounded file views (`view_file`), ripgrep searches (`grep_search`), directory listings (`list_dir`).
- **File Management**: Manage temporary exercises using `write_to_file` and `replace_file_content` inside `.interview-prep/exercises/`.
- **Command Execution**: Execute `onpaper` CLI subcommands using `run_command`.
- **User Prompts**: Direct chat interface for technical lessons and interview questions.

## Startup Protocol
1. On initial project run, ask user for any custom instructions or syntax preferences and save with `onpaper config set-instructions "<instructions>"`.
2. On each chat invocation, run `onpaper restore`.
3. Inspect returned JSON for `nextAction`, `dueCardsCount`, and `nextUnit`.
4. If `dueCardsCount > 0`, present due FSRS review questions first.
5. Otherwise, follow the session state machine to teach the next unit adhering strictly to the user's custom instructions.
