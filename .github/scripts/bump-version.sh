#!/bin/bash
set -e

# Script to automatically bump version based on conventional commits
# Usage: ./bump-version.sh [major|minor|patch|auto]
#
# Auto mode (default): Analyzes commits since last tag
#   - feat: commits -> minor bump
#   - fix: commits -> patch bump
#   - BREAKING CHANGE or major: -> requires manual major bump

BUMP_TYPE="${1:-auto}"
PACKAGE_JSON="frontend/package.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./$PACKAGE_JSON').version")
echo "Current version: $CURRENT_VERSION"

# Parse version into parts
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Get the last tag to analyze commits since then
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")

if [ -z "$LAST_TAG" ]; then
  echo -e "${YELLOW}No previous tag found. Using initial commits.${NC}"
  COMMITS=$(git log --pretty=format:"%s")
else
  echo "Last tag: $LAST_TAG"
  COMMITS=$(git log "$LAST_TAG"..HEAD --pretty=format:"%s")
fi

# Determine bump type if auto mode
if [ "$BUMP_TYPE" == "auto" ]; then
  # Check for breaking changes
  if echo "$COMMITS" | grep -qiE "^(BREAKING CHANGE|major:)"; then
    echo -e "${RED}⚠️  BREAKING CHANGE detected!${NC}"
    echo -e "${RED}Major version bumps must be done manually.${NC}"
    echo -e "${RED}Please run: ./bump-version.sh major${NC}"
    exit 1
  fi

  # Check for features (minor bump)
  if echo "$COMMITS" | grep -qiE "^feat(\(|:)"; then
    BUMP_TYPE="minor"
    echo -e "${GREEN}Feature commits detected -> minor bump${NC}"
  # Check for fixes (patch bump)
  elif echo "$COMMITS" | grep -qiE "^fix(\(|:)"; then
    BUMP_TYPE="patch"
    echo -e "${GREEN}Fix commits detected -> patch bump${NC}"
  else
    # No conventional commits found - default to patch
    BUMP_TYPE="patch"
    echo -e "${YELLOW}No conventional commits found -> defaulting to patch bump${NC}"
  fi
fi

# Calculate new version
case "$BUMP_TYPE" in
  major)
    NEW_MAJOR=$((MAJOR + 1))
    NEW_MINOR=0
    NEW_PATCH=0
    echo -e "${GREEN}Bumping MAJOR version${NC}"
    ;;
  minor)
    NEW_MAJOR=$MAJOR
    NEW_MINOR=$((MINOR + 1))
    NEW_PATCH=0
    echo -e "${GREEN}Bumping MINOR version${NC}"
    ;;
  patch)
    NEW_MAJOR=$MAJOR
    NEW_MINOR=$MINOR
    NEW_PATCH=$((PATCH + 1))
    echo -e "${GREEN}Bumping PATCH version${NC}"
    ;;
  *)
    echo -e "${RED}Invalid bump type: $BUMP_TYPE${NC}"
    echo "Usage: $0 [major|minor|patch|auto]"
    exit 1
    ;;
esac

NEW_VERSION="$NEW_MAJOR.$NEW_MINOR.$NEW_PATCH"
echo "New version: $NEW_VERSION"

# Update package.json using node
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$PACKAGE_JSON', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('$PACKAGE_JSON', JSON.stringify(pkg, null, 2) + '\n');
"

echo -e "${GREEN}✓ Version bumped from $CURRENT_VERSION to $NEW_VERSION${NC}"

# Output for GitHub Actions (only if running in GitHub Actions)
if [ -n "$GITHUB_OUTPUT" ]; then
  echo "NEW_VERSION=$NEW_VERSION" >> $GITHUB_OUTPUT
  echo "version=$NEW_VERSION" >> $GITHUB_OUTPUT
  echo "previous_version=$CURRENT_VERSION" >> $GITHUB_OUTPUT
  echo "bump_type=$BUMP_TYPE" >> $GITHUB_OUTPUT
fi
