# GitHub Copilot Instructions for issue-sync-action

You are an expert TypeScript engineer maintaining `issue-sync-action`, a GitHub Action that syncs issues and comments between repositories. It is used across Camunda's GitHub organization.

## 🚨 CRITICAL CONSTRAINTS (ALWAYS OBEY)

1. **Test-Driven Development:** NO change without a test. EVERY change MUST be tested before completion. No exceptions for "simple" changes.
    - **Unit tests** (`npx jest`): Run before every commit. Cover all business logic with isolated, mocked tests.
    - **Integration tests** (`./test-integration.sh`): Run locally before pushing changes that affect sync behavior, payload handling, or assignee logic. Uses real GitHub API calls.
    - See `TESTING.md` for full details on both test layers.
2. **Build before commit:** ALWAYS run `npm run make-deploy` before committing. This formats, compiles, and bundles into `dist/index.js`. The action runs from `dist/` — source changes without a rebuild are invisible to consumers.
3. **Commit `dist/`:** The compiled `dist/index.js` MUST be committed alongside source changes. GitHub Actions execute `dist/index.js` directly — there is no build step at runtime.
4. **Never commit secrets:** No tokens, API keys, or credentials in source or config files.
5. **Conventional Commits:** All commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/) format (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).

## 🛠️ Tech Stack & Context

- **Runtime:** Node.js 24 (defined in `action.yml` → `runs.using: node24`)
- **Language:** TypeScript (ES6 target, CommonJS modules)
- **Bundler:** `@vercel/ncc` — compiles everything into a single `dist/index.js`
- **Formatter:** Prettier (config in `.prettierrc`: single quotes, 4-space indent, no semicolons, 120 print width)
- **Test Framework:** Jest + ts-jest
- **GitHub API:** `octokit` (REST) + `@actions/core` / `@actions/github` (action toolkit)
- **Package Manager:** npm (lockfile: `package-lock.json`)

## 📐 Repository Structure

```
action.yml              # Action metadata: inputs, outputs, runtime config
index.ts                # Entry point — reads inputs, loads event payload, orchestrates sync
assignees.ts            # Assignee filtering and resolution logic (extracted, testable)
github.ts               # GitHub API wrapper (Octokit operations)
issue.ts                # Data types: Issue, User, IssueComment, Label
labelSyncer.ts          # Label synchronization between repos
utils.ts                # Footer templates, comment matching, body construction
assignees.test.ts       # Unit tests for assignee logic
test-integration.sh     # Local integration test script (uses gh CLI)
TESTING.md              # Full testing guide (unit + integration)
dist/                   # Compiled bundle — COMMITTED, do not edit manually
lib/                    # TypeScript compiler output (intermediate, gitignored)
.github/
├── copilot-instructions.md   # This file
├── instructions/             # File-type-specific AI instructions
└── workflows/
    ├── blank.yml             # Legacy manual test workflow
    └── tests.yml             # CI: unit tests + integration tests
```

## 🏗️ Architecture

### How GitHub Actions Execute This

1. A workflow references `camunda/issue-sync-action@<ref>` (or `uses: ./` for self-test)
2. The runner reads `action.yml` → sees `runs.using: node24`, `main: dist/index.js`
3. The runner sets environment variables:
    - `INPUT_<UPPERCASED_NAME>` for each `with:` input (hyphens become underscores)
    - `GITHUB_EVENT_PATH` → path to a JSON file with the webhook payload
    - `GITHUB_EVENT_NAME` → event type (`issues`, `issue_comment`)
    - `GITHUB_REPOSITORY` → `owner/repo`
4. The runner executes `node dist/index.js`

### Key Constraint for Testing

`@actions/core`'s `core.getInput('foo')` reads `process.env.INPUT_FOO`. `core.getBooleanInput()` does the same with string-to-boolean parsing. The action reads the event payload via `require(process.env.GITHUB_EVENT_PATH)`. These env vars are set by the runner _before_ the action starts — they **cannot** be overridden via step-level `env:` in a workflow for JavaScript actions. For integration testing, you must either:

- Overwrite the file at `$GITHUB_EVENT_PATH` in a _prior_ step (works in CI)
- Set all env vars in the shell before running `node dist/index.js` (works locally)

### Dual Mode: CI vs CLI

`index.ts` has two input-reading branches gated on `process.env.CI == 'true'`:

- **CI mode:** Reads from `core.getInput()` / env vars / `GITHUB_EVENT_PATH`
- **CLI mode:** Reads from `--flag value` command-line arguments (for local dev/testing)

### Sync Flow

1. Parse event payload → extract source `Issue` with labels, assignees, author
2. Filter assignees to humans only (`filterHumanAssignees`)
3. Resolve target assignees based on configured behavior (`resolveTargetAssignees`)
4. Find or create matching issue in target repo (by title or hidden footer comment)
5. Sync issue body, labels, state, assignees
6. Optionally sync comments (if `only_sync_main_issue: false`)

## ⚡ Common Workflows & Commands

| Task                        | Command                  |
| :-------------------------- | :----------------------- |
| **Install dependencies**    | `npm install`            |
| **Run unit tests**          | `npx jest`               |
| **Run tests with coverage** | `npx jest --coverage`    |
| **Format code**             | `npx prettier --write .` |
| **Build + format + bundle** | `npm run make-deploy`    |
| **Local integration test**  | `./test-integration.sh`  |
| **Type check only**         | `npx tsc --noEmit`       |

### Pre-Commit Checklist

```bash
npx jest                    # Unit tests pass
./test-integration.sh       # Integration test passes (if sync logic changed)
npm run make-deploy         # Format + compile + bundle
git add -A                  # Include dist/ changes
git commit                  # Conventional commit message
```

## 📝 Code Standards

### TypeScript

- **Style:** Prettier-enforced. Single quotes, no semicolons, 4-space indent, trailing commas (ES5).
- **Types:** Avoid `any`. Define proper interfaces/types in `issue.ts`.
- **Exports:** Each module should export its public API explicitly.
- **Error handling:** Use `.then()/.catch()` chains (existing pattern) or async/await. Never swallow errors silently.
- **Testability:** Extract logic into pure, testable functions (see `assignees.ts` as the model). Avoid putting business logic in `index.ts` — it should only orchestrate.

### Testing

See `TESTING.md` for the full testing guide. Summary:
- **Unit tests:** `npx jest` — isolated tests for pure business logic modules. Run before every commit.
- **Integration tests:** `./test-integration.sh` — end-to-end test with real GitHub API. Run before pushing sync logic changes.
- **CI:** `.github/workflows/tests.yml` — runs both unit and integration tests on push/PR.

### Workflows (YAML)

- **Extension:** Use `.yml`.
- **Permissions:** Always declare minimal `permissions:` at the job level.
- **Pin actions:** Use commit SHAs for third-party actions (e.g., `actions/checkout@<sha>`), tags are acceptable for first-party `actions/*`.

## 🚧 Boundaries

- ✅ **Always Do:**
    - Run `npm run make-deploy` before committing
    - Run `npx jest` before committing
    - Commit `dist/` alongside source changes
    - Use Conventional Commits format
    - Test locally with `./test-integration.sh` before pushing sync logic changes

- ⚠️ **Ask First:**
    - Adding new npm dependencies (impacts bundle size)
    - Changing `action.yml` inputs/outputs (breaking change for consumers)
    - Modifying the event payload handling in `index.ts`

- 🚫 **Never Do:**
    - Edit `dist/` manually — always rebuild
    - Commit secrets or tokens
    - Skip the build step before committing
    - Skip tests for "simple" changes
    - Add `node_modules/` to git
    - Use `fetch()` directly — use `octokit` for GitHub API calls

## 🔍 Research Protocol

1. **Check action.yml** for available inputs and their defaults.
2. **Check consumer workflows** in `camunda/camunda-cloud-management-apps` (e.g., `other-sync-issues.yml`) to understand real-world usage.
3. **Check GitHub Actions docs** for runner environment variables and action toolkit behavior.

## 🤖 AI Behavior Guidelines

- **Build awareness:** Remember that `dist/index.js` is the actual artifact. Always rebuild after source changes.
- **Input mapping:** `core.getInput('my_input')` reads `INPUT_MY_INPUT`. When testing locally, set `INPUT_<UPPERCASED>` env vars.
- **Event payload:** The action reads the full webhook payload from `GITHUB_EVENT_PATH`. For testing, you must provide a valid JSON file at this path.
- **Commit discipline:** Format → test → build → commit (with dist/) → push.
