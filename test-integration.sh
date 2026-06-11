#!/usr/bin/env bash
#
# Local integration test for issue-sync-action.
# Creates a real issue, injects a Bot assignee, runs the action,
# verifies the synced issue, and cleans up.
#
# Prerequisites:
#   - gh CLI authenticated (gh auth status)
#   - npm dependencies installed (npm install)
#   - dist/ built (npm run make-deploy)
#
# Usage:
#   ./test-integration.sh                              # uses camunda/issue-sync-action
#   REPO=owner/repo ./test-integration.sh              # override target repo
#   SKIP_CLEANUP=1 ./test-integration.sh               # keep test issues for debugging
#
set -euo pipefail

REPO="${REPO:-camunda/issue-sync-action}"
SKIP_CLEANUP="${SKIP_CLEANUP:-}"
SOURCE_ISSUE=""
TARGET_ISSUE=""
EVENT_FILE=""

# Close every open issue that belongs to the integration test, including leaks
# from earlier failed runs. Matches issues carrying the integration-test or
# integration-test-synced label, OR the "[integration-test]" title prefix, so
# nothing slips through even if a label failed to apply.
sweep_integration_issues() {
    local nums num
    nums=$(
        {
            gh issue list --repo "$REPO" --state open --limit 200 \
                --label "integration-test" --json number --jq '.[].number'
            gh issue list --repo "$REPO" --state open --limit 200 \
                --label "integration-test-synced" --json number --jq '.[].number'
            gh issue list --repo "$REPO" --state open --limit 200 \
                --search '[integration-test] in:title' --json number --jq '.[].number'
        } | sort -un
    )
    for num in $nums; do
        gh issue close "$num" --repo "$REPO" --reason "not planned" 2>/dev/null && \
            echo "Closed #${num}" || echo "Failed to close #${num}"
    done
}

cleanup() {
    if [[ -n "$SKIP_CLEANUP" ]]; then
        echo "SKIP_CLEANUP set — leaving issues open"
        [[ -n "$SOURCE_ISSUE" ]] && echo "  Source: https://github.com/${REPO}/issues/${SOURCE_ISSUE}"
        [[ -n "$TARGET_ISSUE" ]] && echo "  Target: https://github.com/${REPO}/issues/${TARGET_ISSUE}"
        [[ -f "$EVENT_FILE" ]] && rm -f "$EVENT_FILE"
        return
    fi
    echo ""
    echo "=== Cleanup ==="
    # Sweep covers the tracked source/target issues as well as any historical leaks.
    sweep_integration_issues
    # Remove temp event file
    [[ -f "$EVENT_FILE" ]] && rm -f "$EVENT_FILE"
}
trap cleanup EXIT

# Clear any backlog from previously failed runs before starting, so the verify
# step can unambiguously find the issue created by *this* run.
if [[ -z "$SKIP_CLEANUP" ]]; then
    echo "=== Step 0: Sweep leftover integration-test issues ==="
    sweep_integration_issues
    echo ""
fi

echo "=== Step 1: Create test issue ==="

# Determine an *assignable* human user for the test.
# The action only preserves assignees of type "User"; bots are filtered out.
# In CI the workflow can be triggered by a bot (e.g. renovate[bot] on dependency
# PRs). Bots/agents cannot be assigned to issues with the installation
# GITHUB_TOKEN ("Assigning agents is not supported ... replaceActorsForAssignable"),
# so never assign GITHUB_ACTOR blindly: verify it is assignable and otherwise fall
# back to the first assignable user on the repo.
pick_assignee() {
    local candidate="${1:-}"
    if [[ -n "$candidate" && "$candidate" != *"[bot]" ]] \
        && gh api "repos/${REPO}/assignees/${candidate}" --silent 2>/dev/null; then
        echo "$candidate"
        return 0
    fi
    gh api "repos/${REPO}/assignees" --jq '.[0].login // empty'
}

if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    ASSIGNEE=$(pick_assignee "${GITHUB_ACTOR:-}")
    echo "Running in GitHub Actions CI — actor=${GITHUB_ACTOR:-<unset>}, chosen assignee=${ASSIGNEE:-<none>}"
else
    ASSIGNEE=$(pick_assignee "$(gh api user --jq '.login')")
    echo "Running locally — chosen assignee=${ASSIGNEE:-<none>}"
fi

if [[ -z "$ASSIGNEE" ]]; then
    echo "FAIL: Could not determine an assignable user for ${REPO}"
    exit 1
fi

# Create the source issue first WITHOUT an assignee so the issue number is always
# captured. If creation and assignment were combined and assignment failed, the
# issue would still be created but its number lost — leaking an un-cleaned issue.
# `gh issue create` prints the issue URL; extract the trailing number with a Bash
# regex (portable, no PCRE/grep -P which is unavailable on e.g. macOS).
SOURCE_ISSUE_URL=$(gh issue create \
    --repo "$REPO" \
    --title "[integration-test] $(date +%s)" \
    --body "Automated integration test. Will be cleaned up." \
    --label "integration-test")
if [[ "$SOURCE_ISSUE_URL" =~ /([0-9]+)[[:space:]]*$ ]]; then
    SOURCE_ISSUE="${BASH_REMATCH[1]}"
else
    echo "FAIL: Could not parse issue number from create output: ${SOURCE_ISSUE_URL}"
    exit 1
fi
echo "Created source issue #${SOURCE_ISSUE}"

# Assign the human separately (best-effort). The injected payload below is the
# source of truth for the action under test, so a GitHub-side assignment failure
# must not fail or leak the test.
if gh issue edit "$SOURCE_ISSUE" --repo "$REPO" --add-assignee "$ASSIGNEE" 2>/dev/null; then
    echo "Assigned ${ASSIGNEE} to source issue #${SOURCE_ISSUE}"
else
    echo "WARN: could not assign ${ASSIGNEE} on GitHub — continuing with synthetic payload"
fi

echo ""
echo "=== Step 2: Build event payload ==="
EVENT_FILE=$(mktemp /tmp/issue-sync-test-event.XXXXXX.json)

# Build the event payload from the real issue, then inject a known human assignee
# and a Bot assignee. The action reads assignees from this payload (GITHUB_EVENT_PATH),
# so injecting them deterministically decouples the test from GitHub-side assignment
# (which can be rejected when the workflow actor is a bot).
gh api "repos/${REPO}/issues/${SOURCE_ISSUE}" | \
    jq --arg human "$ASSIGNEE" '{
        action: "labeled",
        issue: (. + {
            assignees: [
                {login: $human, type: "User"},
                {login: "github-actions[bot]", type: "Bot"}
            ]
        })
    }' > "$EVENT_FILE"

echo "Event file: $EVENT_FILE"
echo "Assignees in payload:"
jq -r '.issue.assignees[] | "  \(.login) (type: \(.type // "null"))"' "$EVENT_FILE"

# Sanity check: the payload must contain at least one human assignee for the test
# to be meaningful.
PAYLOAD_HUMANS=$(jq '[.issue.assignees[] | select(.type == "User")] | length' "$EVENT_FILE")
if [[ "$PAYLOAD_HUMANS" -eq 0 ]]; then
    echo "FAIL: Event payload has no human assignee — test setup is broken"
    exit 1
fi

echo ""
echo "=== Step 3: Run action ==="

# @actions/core reads inputs from INPUT_* env vars (uppercased, hyphens -> underscores)
GITHUB_TOKEN=$(gh auth token) \
CI=true \
GITHUB_EVENT_PATH="$EVENT_FILE" \
GITHUB_EVENT_NAME=issues \
GITHUB_REPOSITORY="$REPO" \
INPUT_REPO_TARGET="$REPO" \
INPUT_ONLY_SYNC_ON_LABEL="integration-test" \
INPUT_ONLY_SYNC_MAIN_ISSUE="true" \
INPUT_CREATE_ISSUES_ON_EDIT="true" \
INPUT_ADDITIONAL_ISSUE_LABELS="integration-test-synced" \
INPUT_SYNC_REPO_LABELS="false" \
INPUT_USE_COMMENT_FOR_ISSUE_MATCHING="true" \
INPUT_TARGET_ISSUE_ASSIGNEES_BEHAVIOR="add_static" \
INPUT_TARGET_ISSUE_ASSIGNEES_STATIC="" \
INPUT_TARGET_ISSUE_FOOTER_TEMPLATE='<sup>:robot: synced from: [source]({{<link>}})</sup>' \
INPUT_TARGET_COMMENT_FOOTER_TEMPLATE="" \
INPUT_SKIP_COMMENT_SYNC_KEYWORDS="" \
INPUT_SKIPPED_COMMENT_MESSAGE="" \
INPUT_ISSUE_CREATED_COMMENT_TEMPLATE="" \
    node dist/index.js

echo ""
echo "=== Step 4: Verify ==="

# Find the synced issue by the integration-test-synced label
sleep 2  # give GitHub a moment to index
TARGET_ISSUE=$(gh issue list --repo "$REPO" --label "integration-test-synced" --state open --json number --jq '.[0].number // empty')

if [[ -z "$TARGET_ISSUE" ]]; then
    echo "FAIL: No synced issue found with label 'integration-test-synced'"
    exit 1
fi
echo "Found synced issue #${TARGET_ISSUE}"

# Check assignees on the target issue
ASSIGNEES_JSON=$(gh api "repos/${REPO}/issues/${TARGET_ISSUE}" --jq '.assignees')
BOT_ASSIGNEES=$(echo "$ASSIGNEES_JSON" | jq '[.[] | select(.type == "Bot")] | length')
HUMAN_ASSIGNEES=$(echo "$ASSIGNEES_JSON" | jq '[.[] | select(.type == "User")] | length')

if [[ "$BOT_ASSIGNEES" -gt 0 ]]; then
    echo "FAIL: Bot assignees leaked through to target issue!"
    echo "$ASSIGNEES_JSON" | jq '.[] | {login, type}'
    exit 1
fi

if [[ "$HUMAN_ASSIGNEES" -eq 0 ]]; then
    echo "FAIL: No human assignees on the target issue — expected ${ASSIGNEE} to be kept!"
    exit 1
fi

echo "Assignees on target issue:"
echo "$ASSIGNEES_JSON" | jq -r '.[] | "  \(.login) (type: \(.type))"'
echo ""
echo "PASS: Human assignees preserved, bot assignees filtered."
