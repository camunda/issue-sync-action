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

cleanup() {
    if [[ -n "$SKIP_CLEANUP" ]]; then
        echo "SKIP_CLEANUP set — leaving issues open"
        [[ -n "$SOURCE_ISSUE" ]] && echo "  Source: https://github.com/${REPO}/issues/${SOURCE_ISSUE}"
        [[ -n "$TARGET_ISSUE" ]] && echo "  Target: https://github.com/${REPO}/issues/${TARGET_ISSUE}"
        return
    fi
    echo ""
    echo "=== Cleanup ==="
    for num in $SOURCE_ISSUE $TARGET_ISSUE; do
        if [[ -n "$num" ]]; then
            gh issue close "$num" --repo "$REPO" --reason "not planned" 2>/dev/null && \
                echo "Closed #${num}" || echo "Failed to close #${num}"
        fi
    done
    # Remove temp event file
    [[ -f "$EVENT_FILE" ]] && rm -f "$EVENT_FILE"
}
trap cleanup EXIT

echo "=== Step 1: Create test issue ==="

# In GitHub Actions, GITHUB_ACTIONS=true and the token can't call GET /user or assign bots.
# Locally, gh authenticates as a real user who can be assigned.
if [[ "${GITHUB_ACTIONS:-}" == "true" ]]; then
    echo "Running in GitHub Actions CI — creating issue without human assignee"
    EXPECT_HUMAN_ASSIGNEE=false
    SOURCE_ISSUE=$(gh issue create \
        --repo "$REPO" \
        --title "[integration-test] ci-$(date +%s)" \
        --body "Automated CI integration test. Will be cleaned up." \
        --label "integration-test" \
        | grep -oP '\d+$')
    echo "Created source issue #${SOURCE_ISSUE} (CI mode — no assignee)"
else
    CURRENT_USER=$(gh api user --jq '.login')
    EXPECT_HUMAN_ASSIGNEE=true
    SOURCE_ISSUE=$(gh issue create \
        --repo "$REPO" \
        --title "[integration-test] local-$(date +%s)" \
        --body "Automated local integration test. Will be cleaned up." \
        --label "integration-test" \
        --assignee "$CURRENT_USER" \
        | grep -oP '\d+$')
    echo "Created source issue #${SOURCE_ISSUE} (assigned to ${CURRENT_USER})"
fi

echo ""
echo "=== Step 2: Build event payload ==="
EVENT_FILE=$(mktemp /tmp/issue-sync-test-event.XXXXXX.json)

# Fetch the real issue (which has the human assignee) and inject a Bot assignee
gh api "repos/${REPO}/issues/${SOURCE_ISSUE}" | \
    jq '{
        action: "labeled",
        issue: (. + {
            assignees: (.assignees + [{login: "github-actions[bot]", type: "Bot"}])
        })
    }' > "$EVENT_FILE"

echo "Event file: $EVENT_FILE"
echo "Assignees in payload:"
jq -r '.issue.assignees[] | "  \(.login) (type: \(.type // "null"))"' "$EVENT_FILE"

# Sanity check: verify the source issue actually has the human assignee on GitHub (local mode only)
if [[ "$EXPECT_HUMAN_ASSIGNEE" == "true" ]]; then
    SOURCE_ASSIGNEES=$(gh api "repos/${REPO}/issues/${SOURCE_ISSUE}" --jq '[.assignees[].login] | join(", ")')
    echo "Actual assignees on source issue #${SOURCE_ISSUE}: ${SOURCE_ASSIGNEES}"
    if [[ -z "$SOURCE_ASSIGNEES" ]]; then
        echo "FAIL: Source issue has no assignees — test setup is broken"
        exit 1
    fi
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

if [[ "$EXPECT_HUMAN_ASSIGNEE" == "true" ]] && [[ "$HUMAN_ASSIGNEES" -eq 0 ]]; then
    echo "FAIL: No human assignees on the target issue — expected the source user to be kept!"
    exit 1
fi

echo "Assignees on target issue:"
echo "$ASSIGNEES_JSON" | jq -r '.[] | "  \(.login) (type: \(.type))"'
echo ""
echo "PASS: Human assignees preserved, bot assignees filtered."
