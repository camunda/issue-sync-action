---
applyTo: '**/*.yml'
---

# GitHub Actions Workflow Guidelines

## Purpose & Scope

Standards for GitHub Actions workflow files in `issue-sync-action`.

## File Conventions

- **Extension:** Always use `.yml` (not `.yaml`).
- **Location:** `.github/workflows/`
- **Document separator:** Start with `---`.

## Security

- **Permissions:** Always declare minimal `permissions:` at the workflow or job level. Never use `permissions: write-all`.
- **Pin third-party actions** to full commit SHAs (e.g., `actions/checkout@<sha>`). Tags are acceptable only for first-party `actions/*` actions.
- **Secrets:** Use `${{ secrets.GITHUB_TOKEN }}` or Vault-provided tokens. Never hardcode credentials.

## Testing This Action in CI

### Critical: JavaScript Action Environment Variables

When this action runs via `uses: ./`, the GitHub Actions runner:

1. Reads `action.yml` → finds `runs.using: node24`, `main: dist/index.js`
2. Sets `INPUT_<UPPERCASED_NAME>` env vars from each `with:` parameter
3. Sets `GITHUB_EVENT_PATH` to the webhook payload JSON file
4. Sets `GITHUB_EVENT_NAME` to the triggering event
5. Executes `node dist/index.js`

**These env vars are set by the runner BEFORE the action starts.** Step-level `env:` overrides for `GITHUB_EVENT_PATH` or `GITHUB_EVENT_NAME` do NOT work for JavaScript actions.

### How to Test with Custom Payloads

To inject a custom event payload in CI:

1. In a `run:` step BEFORE the action step, overwrite the file at `$GITHUB_EVENT_PATH`:
    ```yaml
    - name: Prepare event payload
      run: |
          gh api "repos/${{ github.repository }}/issues/${ISSUE_NUMBER}" | \
            jq '{action: "labeled", issue: .}' > "$GITHUB_EVENT_PATH"
          echo "GITHUB_EVENT_NAME=issues" >> "$GITHUB_ENV"
    ```
2. The subsequent `uses: ./` step will read the overwritten file.

### Cleanup

Always clean up test-created issues using `if: always()` to ensure cleanup runs even on failure.

## Workflow Structure

```yaml
---
name: Descriptive Name

on:
    push:
        branches: [main]
    pull_request:
        branches: [main]

permissions:
    contents: read

jobs:
    job-name:
        name: Human-Readable Name
        runs-on: ubuntu-latest
        permissions:
            issues: write # only if needed
        steps:
            - uses: actions/checkout@v4
            # ...
```
