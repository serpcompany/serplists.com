# AGENTS

Using `rg` crashes VS Code because it spawns hundreds of processes. DO NOT USE IT

## Git Flow

- `main` is the production branch.
- `staging` is the primary integration branch for active development.
- New implementation work should happen on short-lived issue/task branches created from `staging` unless there is an explicit reason to branch from somewhere else.
- Finished issue/task branches should merge into `staging` first.
- Only promote changes from `staging` into `main` when they are ready for production.
