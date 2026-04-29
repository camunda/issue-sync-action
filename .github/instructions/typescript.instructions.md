---
applyTo: '**/*.ts'
---

# TypeScript Guidelines

## Purpose & Scope

Standards for TypeScript source files in `issue-sync-action`. All `.ts` files (except tests) are compiled by `tsc` and bundled by `@vercel/ncc` into `dist/index.js`.

## Style

Enforced by Prettier (`.prettierrc`):

- Single quotes, no semicolons, 4-space indent, 120 char line width, ES5 trailing commas.
- Run `npx prettier --write .` or `npm run make-deploy` (which includes formatting).

## Types

- **No `any`:** Define proper types/interfaces in `issue.ts` for all GitHub API data structures.
- **Nullability:** Use `undefined` over `null` where possible. Use optional chaining (`?.`) and nullish coalescing (`??`).
- **Enums:** Use string enums for values that map to action inputs (see `TargetIssueAssigneesBehavior`).

## Module Structure

| File             | Responsibility                                                              |
| :--------------- | :-------------------------------------------------------------------------- |
| `index.ts`       | Entry point — reads inputs, loads payload, orchestrates. No business logic. |
| `assignees.ts`   | Assignee filtering/resolution. Pure functions, fully testable.              |
| `github.ts`      | `GitHub` class — Octokit wrapper for all API calls.                         |
| `issue.ts`       | Data types: `Issue`, `User`, `IssueComment`, `Label`.                       |
| `labelSyncer.ts` | Label sync logic between repos.                                             |
| `utils.ts`       | `Utils` class — footer templates, comment matching, body construction.      |

## Patterns

- **Extract logic into testable modules:** `index.ts` should only orchestrate. Business logic belongs in dedicated modules (e.g., `assignees.ts`).
- **Error handling:** Use `.then()/.catch()` chains (existing codebase pattern). Async/await is also acceptable. Never swallow errors silently.
- **GitHub API:** Always use `octokit` via the `GitHub` class. Never use raw `fetch()`.

## Input Handling

`index.ts` supports two input modes gated on `process.env.CI == 'true'`:

- **CI mode:** `core.getInput()` reads from `INPUT_<UPPERCASED_NAME>` env vars. `core.getBooleanInput()` parses string booleans.
- **CLI mode:** Reads from `--flag value` command-line arguments.

When adding a new action input:

1. Add the input definition in `action.yml`
2. Add the `core.getInput()` call in the CI branch of `index.ts`
3. Add the `--flag` parsing in the CLI branch of `index.ts`

## Build Pipeline

```
tsc (TypeScript → lib/)  →  ncc build (lib/ → dist/index.js)
```

- `dist/index.js` is the only artifact the GitHub Actions runner executes.
- `lib/` is intermediate output (gitignored).
- `dist/` MUST be committed alongside source changes.
