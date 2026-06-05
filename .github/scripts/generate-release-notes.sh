#!/bin/bash
set -e

# Script to generate release notes from conventional commits
# Usage: ./generate-release-notes.sh <previous_tag> <new_version>

PREVIOUS_TAG="$1"
NEW_VERSION="$2"

if [ -z "$PREVIOUS_TAG" ] || [ -z "$NEW_VERSION" ]; then
  echo "Usage: $0 <previous_tag> <new_version>"
  exit 1
fi

# Initialize release notes
RELEASE_NOTES="# Release v${NEW_VERSION}

## What's Changed

"

# Get commits since last tag
if [ "$PREVIOUS_TAG" == "none" ]; then
  COMMITS=$(git log --pretty=format:"%s|||%h|||%an" --reverse)
else
  COMMITS=$(git log "${PREVIOUS_TAG}..HEAD" --pretty=format:"%s|||%h|||%an" --reverse)
fi

# Categorize commits
FEATURES=""
FIXES=""
CHORES=""
BREAKING=""
OTHER=""

while IFS='|||' read -r subject hash author; do
  # Parse conventional commit
  if [[ "$subject" =~ ^feat(\(([^\)]+)\))?:\ (.+)$ ]]; then
    scope="${BASH_REMATCH[2]}"
    message="${BASH_REMATCH[3]}"
    if [ -n "$scope" ]; then
      FEATURES="${FEATURES}- **${scope}**: ${message} (${hash}) @${author}\n"
    else
      FEATURES="${FEATURES}- ${message} (${hash}) @${author}\n"
    fi
  elif [[ "$subject" =~ ^fix(\(([^\)]+)\))?:\ (.+)$ ]]; then
    scope="${BASH_REMATCH[2]}"
    message="${BASH_REMATCH[3]}"
    if [ -n "$scope" ]; then
      FIXES="${FIXES}- **${scope}**: ${message} (${hash}) @${author}\n"
    else
      FIXES="${FIXES}- ${message} (${hash}) @${author}\n"
    fi
  elif [[ "$subject" =~ ^(chore|build|ci|docs|style|refactor|perf|test)(\(([^\)]+)\))?:\ (.+)$ ]]; then
    type="${BASH_REMATCH[1]}"
    scope="${BASH_REMATCH[3]}"
    message="${BASH_REMATCH[4]}"
    if [ -n "$scope" ]; then
      CHORES="${CHORES}- **${type}(${scope})**: ${message} (${hash})\n"
    else
      CHORES="${CHORES}- **${type}**: ${message} (${hash})\n"
    fi
  elif [[ "$subject" =~ BREAKING\ CHANGE ]]; then
    BREAKING="${BREAKING}- ${subject} (${hash}) @${author}\n"
  else
    OTHER="${OTHER}- ${subject} (${hash})\n"
  fi
done <<< "$COMMITS"

# Build release notes
if [ -n "$BREAKING" ]; then
  RELEASE_NOTES="${RELEASE_NOTES}### ⚠️ BREAKING CHANGES

${BREAKING}
"
fi

if [ -n "$FEATURES" ]; then
  RELEASE_NOTES="${RELEASE_NOTES}### ✨ Features

${FEATURES}
"
fi

if [ -n "$FIXES" ]; then
  RELEASE_NOTES="${RELEASE_NOTES}### 🐛 Bug Fixes

${FIXES}
"
fi

if [ -n "$CHORES" ]; then
  RELEASE_NOTES="${RELEASE_NOTES}### 🔧 Maintenance

${CHORES}
"
fi

if [ -n "$OTHER" ]; then
  RELEASE_NOTES="${RELEASE_NOTES}### 📝 Other Changes

${OTHER}
"
fi

# Add deployment info
RELEASE_NOTES="${RELEASE_NOTES}
---

**Deployment Information:**
- Deployed to PROD: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
- Previous version: ${PREVIOUS_TAG}
- New version: v${NEW_VERSION}

**Full Changelog**: https://github.com/$GITHUB_REPOSITORY/compare/${PREVIOUS_TAG}...v${NEW_VERSION}
"

# Output release notes
echo -e "$RELEASE_NOTES"

# Save to file for GitHub Actions
echo "$RELEASE_NOTES" > /tmp/release-notes.md
