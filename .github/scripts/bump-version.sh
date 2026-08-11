#!/bin/bash
set -e

# Script to bump the release version, derived from the latest git tag.
# Usage: ./bump-version.sh [major|minor|patch|auto]
#
# The latest git tag (vX.Y.Z) is the single source of truth for the current
# version — NOT frontend/package.json — so the version always advances on every
# merge without needing to commit package.json back to main.
#
#   auto (default): minor bump on every run (project policy: minor per merge).
#   minor:          X.Y.Z -> X.(Y+1).0
#   patch:          X.Y.Z -> X.Y.(Z+1)
#   major:          (X+1).0.0   (must be requested explicitly)

BUMP_TYPE="${1:-auto}"
PACKAGE_JSON="frontend/package.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Derive the current version from the latest git tag (source of truth).
# Fall back to package.json, then 0.0.0, when no tag exists yet.
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  CURRENT_VERSION="${LAST_TAG#v}"   # strip leading "v"
  echo "Latest tag: $LAST_TAG"
else
  CURRENT_VERSION=$(node -p "require('./$PACKAGE_JSON').version" 2>/dev/null || echo "0.0.0")
  echo -e "${YELLOW}No previous tag found. Falling back to package.json version.${NC}"
fi
echo "Current version: $CURRENT_VERSION"

# Parse version into parts
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
MAJOR="${MAJOR:-0}"
MINOR="${MINOR:-0}"
PATCH="${PATCH:-0}"

# Auto mode: project policy is a minor bump on every merge.
if [ "$BUMP_TYPE" == "auto" ]; then
  BUMP_TYPE="minor"
  echo -e "${GREEN}Auto mode -> minor bump (one minor version per merge)${NC}"
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

# Update package.json so the workspace reflects the new version (used by the
# release step to read the version). This is not committed back — the git tag
# remains the source of truth.
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
