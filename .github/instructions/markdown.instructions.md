---
applyTo: '**/*.md'
---

# Markdown Documentation Guidelines

## Purpose & Scope

Standards for documentation files in `issue-sync-action`.

## Writing Style

- Be **brief** — prefer bullet points over prose.
- Use **code blocks** with language hints for commands and config snippets.
- Use tables for structured reference information (inputs, commands, env vars).

## Key Files

| File                              | Purpose                                                          |
| :-------------------------------- | :--------------------------------------------------------------- |
| `README.md`                       | User-facing: usage examples, input reference, setup instructions |
| `action.yml`                      | Authoritative source for input definitions — keep README in sync |
| `.github/copilot-instructions.md` | AI assistant context for this repo                               |

## Updating Documentation

- When adding or changing action inputs in `action.yml`, update the README usage examples.
- When adding new source modules, update the repository structure section in `copilot-instructions.md`.
- Keep the README focused on consumer usage. Internal architecture details belong in `copilot-instructions.md`.
