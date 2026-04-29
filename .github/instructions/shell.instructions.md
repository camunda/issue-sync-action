---
applyTo: '**/*.sh'
---

# Shell Scripting Guidelines

## Purpose & Scope

Standards for Bash scripts in `issue-sync-action`, primarily the integration test script.

## Safety & Robustness

- **Shebang:** Use `#!/usr/bin/env bash` for portability.
- **Error handling:** Start scripts with `set -euo pipefail`.
- **Quoting:** Always quote variables: `"$var"` not `$var`.
- **Cleanup:** Use `trap` to ensure cleanup on exit (closing test issues, removing temp files).
- **Temp files:** Use `mktemp` and clean up in the `trap` handler.

## Style

- **Indentation:** 2 spaces.
- **Conditionals:** Use `[[ ... ]]`, never `[ ... ]`.
- **Command substitution:** Use `$(...)`, never backticks.
- **Variables:** `snake_case` for locals, `UPPER_SNAKE_CASE` for env vars and constants.

## Integration Test Script Pattern

The `test-integration.sh` script is the primary local integration test:

1. Creates a test issue via `gh api`
2. Builds a synthetic event payload with `jq`
3. Sets env vars (`CI=true`, `INPUT_*`, `GITHUB_EVENT_PATH`, etc.)
4. Runs `node dist/index.js`
5. Verifies the synced issue via `gh api`
6. Cleans up (closes issues, removes temp files)

### Prerequisites

- `gh` CLI authenticated (`gh auth status`)
- `dist/index.js` built (`npm run make-deploy`)
- Network access to GitHub API

### Environment Variables

| Variable       | Purpose                                                     |
| :------------- | :---------------------------------------------------------- |
| `REPO`         | Override target repo (default: `camunda/issue-sync-action`) |
| `SKIP_CLEANUP` | Set to `1` to keep test issues open for debugging           |
