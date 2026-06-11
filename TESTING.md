# Testing Guide

## General Principles

Always test changes before committing:

- **Unit tests** run on every commit — fast, isolated, no network required
- **Integration tests** run before pushing sync logic changes — real GitHub API calls
- **CI** runs both layers on every push and PR

## Unit Tests

Fast, isolated tests for pure business logic modules. No network, no GitHub API.

```bash
npx jest              # Run all unit tests
npx jest --coverage   # Run with coverage report
npx jest --watch      # Watch mode for development
```

### File Naming

Test files live next to their source: `<module>.test.ts` (e.g., `assignees.test.ts`).

### Structure

- `describe` blocks per function
- `it`/`test` with descriptive names
- Inline test data — no external fixture files unless data is large

### What to Test

- All business logic extracted into modules (e.g., `assignees.ts`)
- Edge cases: empty arrays, undefined/missing fields, backwards compatibility with older payloads
- Do **not** unit test `index.ts` directly — it's an orchestrator that reads env vars and calls modules

### When to Update

- Adding or modifying business logic → add/update unit tests
- Fixing a bug → add a regression test that reproduces the bug
- Refactoring → existing tests should still pass; update if signatures change

## Integration Tests

End-to-end tests that exercise the full action against the real GitHub API. The integration test creates real issues, runs `node dist/index.js`, and verifies real state on GitHub.

### Running Locally (Preferred for Iteration)

```bash
./test-integration.sh                              # Default: camunda/issue-sync-action
REPO=owner/repo ./test-integration.sh              # Override target repo
SKIP_CLEANUP=1 ./test-integration.sh               # Keep test issues open for debugging
```

#### Prerequisites

- `gh` CLI authenticated: `gh auth status`
- `dist/index.js` built: `npm run make-deploy`
- Write access to the target repo (to create/close issues)

#### What the Script Does

0. **Sweeps leftover issues** — closes any open issue carrying the `integration-test` / `integration-test-synced` label or the `[integration-test]` title prefix, clearing the backlog from earlier failed runs (skipped when `SKIP_CLEANUP=1`)
1. **Picks an assignable human** — prefers `GITHUB_ACTOR`, but only if it is a real, assignable user; otherwise falls back to the first assignable user on the repo. This avoids assigning bots (e.g. `renovate[bot]` on dependency PRs), which the installation `GITHUB_TOKEN` cannot assign
2. **Creates a real issue** with the `integration-test` label (number captured first), then assigns the human in a separate, best-effort step
3. **Builds a synthetic event payload** by injecting both the chosen human assignee (`type: User`) and a fake Bot assignee (`type: Bot`) — the action reads assignees from the payload (`GITHUB_EVENT_PATH`), so this decouples the test from GitHub-side assignment
4. **Runs `node dist/index.js`** with `CI=true` and all `INPUT_*` env vars set, simulating the GitHub Actions runtime
5. **Verifies the real target issue** on GitHub: human assignee preserved, bot assignee filtered out, correct labels applied
6. **Cleans up** by sweeping every integration-test issue (source, synced target, and any leak), unless `SKIP_CLEANUP=1`

#### Debugging Failures

- Use `SKIP_CLEANUP=1` to keep test issues open for inspection (also disables the start-of-run sweep)
- Check the script output for the source/target issue URLs
- Verify real state with: `gh api repos/OWNER/REPO/issues/NUMBER --jq '{title, assignees: [.assignees[] | {login, type}]}'`

> **Why it failed in CI (May 2026):** Dependency PRs run as `renovate[bot]`, and the
> script assigned `GITHUB_ACTOR` directly. GitHub's `replaceActorsForAssignable`
> mutation rejects assigning bots/agents with an installation token, so issue
> creation failed *after* the issue was already created — leaking an un-cleaned
> issue on every run. The script now picks an assignable human and always captures
> the issue number before assigning.

### Running in CI

Integration tests also run in `.github/workflows/tests.yml` on every push/PR. The CI workflow:

- Creates a test issue via `actions/github-script`
- Overwrites `$GITHUB_EVENT_PATH` in a `run:` step to inject the test payload
- Runs the action via `uses: ./`
- Verifies and cleans up via `actions/github-script`

**Key CI constraint:** `GITHUB_EVENT_PATH` cannot be overridden via step-level `env:` for JavaScript actions. The runner resolves it before the action starts. To inject a custom payload, overwrite the **file** at `$GITHUB_EVENT_PATH` in a prior `run:` step.

### When to Update

- Adding or modifying sync behavior → update integration test
- Changing assignee filtering/resolution → update integration test assertions
- Changing action inputs in `action.yml` → update `INPUT_*` env vars in the script

## Pre-Commit Checklist

```bash
npx jest                    # Unit tests pass
./test-integration.sh       # Integration test passes (if sync logic changed)
npm run make-deploy         # Format + compile + bundle
git add -A                  # Include dist/ changes
git commit                  # Conventional commit message
```
