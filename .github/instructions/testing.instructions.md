---
applyTo: '**/*.test.ts'
---

# Testing Guidelines

> **EVERY change MUST be tested.** No exceptions for "simple" changes.
> See `TESTING.md` at the repo root for the full testing guide including integration tests.

## Unit Tests

- **Framework:** Jest with `ts-jest` preset. Configuration in `package.json` under `"jest"`.
- **File naming:** `<module>.test.ts` next to the source file (e.g., `assignees.test.ts`).
- **Structure:** Use `describe` blocks per function, `it`/`test` with descriptive names.
- **Run:** `npx jest` (all tests) or `npx jest --testPathPattern=<file>` (single file).

### Writing Tests

- Test pure functions extracted into modules — not `index.ts` directly.
- Cover edge cases: empty arrays, undefined/missing fields, backwards compatibility with older payloads.
- Use inline test data. No external fixture files unless the data is large.

### Example Pattern

```typescript
import { filterHumanAssignees } from './assignees'

describe('filterHumanAssignees', () => {
    it('should keep regular users', () => {
        const result = filterHumanAssignees([{ login: 'alice', type: 'User' }])
        expect(result).toEqual(['alice'])
    })

    it('should filter out Bot users', () => {
        const result = filterHumanAssignees([{ login: 'bot[bot]', type: 'Bot' }])
        expect(result).toEqual([])
    })
})
```

## Integration Tests

### Local (Preferred for Iteration)

Use `./test-integration.sh` for end-to-end testing against the real GitHub API:

- Requires `gh` CLI authenticated (`gh auth status`).
- Creates a real issue, injects test data, runs `node dist/index.js`, verifies, cleans up.
- Use `SKIP_CLEANUP=1` to keep test issues open for debugging.
- Use `REPO=owner/repo` to override the target repository.

### CI

Integration tests in `.github/workflows/tests.yml` use the same repo (`camunda/issue-sync-action`) as both source and target. Key constraints:

- **`GITHUB_EVENT_PATH` cannot be overridden via step-level `env:`** for JavaScript actions. The runner resolves it before the action starts. To inject a custom payload, overwrite the file at `$GITHUB_EVENT_PATH` in a _prior_ `run:` step.
- **`GITHUB_EVENT_NAME`** can be set for subsequent steps via `echo "GITHUB_EVENT_NAME=issues" >> "$GITHUB_ENV"`.
- Use `actions/github-script` for setup/teardown (creating/closing issues). Use `run:` + `gh api` + `jq` for payload manipulation.

## Pre-Commit

Always run `npx jest` before committing. Tests must pass with zero failures.
If sync logic changed, also run `./test-integration.sh` before pushing.
