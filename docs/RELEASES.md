# Release Process

This document describes the automated release process for the nr-notify application.

## Overview

The nr-notify project uses **automated semantic versioning** and **GitHub Releases** to track production deployments. Every successful production deployment automatically creates a Git tag and corresponding GitHub release.

## Semantic Versioning

We follow [Semantic Versioning (SemVer)](https://semver.org/) with the format `MAJOR.MINOR.PATCH`:

- **MAJOR**: Breaking changes (manual only)
- **MINOR**: New features (automated from `feat:` commits)
- **PATCH**: Bug fixes (automated from `fix:` commits)

### Version Format

Tags follow the pattern: `v{MAJOR}.{MINOR}.{PATCH}`

Examples:
- `v0.5.0` - Initial version
- `v0.6.0` - Minor version bump (new feature)
- `v0.6.1` - Patch version bump (bug fix)
- `v1.0.0` - Major version bump (breaking change)

## Automated Release Workflow

### When are releases created?

Releases are **automatically created** after every successful production deployment via the `merge.yml` workflow:

1. **Merge to `main` branch** triggers the deployment pipeline
2. **DEV deployment** - Automatic
3. **TEST deployment** - May require approval
4. **PROD deployment** - Requires approval
5. **Create Release** - Automatic after successful PROD deployment

### How version bumping works

The system analyzes commit messages since the last tag to determine the version bump:

| Commit Type | Version Bump | Example Commit |
|-------------|--------------|----------------|
| `feat:` or `feat(scope):` | **MINOR** bump | `feat: add email notifications` |
| `fix:` or `fix(scope):` | **PATCH** bump | `fix: resolve database timeout` |
| `BREAKING CHANGE` | **MANUAL** required | Requires explicit major bump |
| Other (chore, docs, etc.) | **PATCH** bump | `chore: update dependencies` |

### Automated Steps

After PROD deployment succeeds, the workflow:

1. ✓ Analyzes commits since last tag
2. ✓ Determines version bump (minor for `feat:`, patch for `fix:`)
3. ✓ Updates `frontend/package.json` with new version
4. ✓ Commits version change to `main` branch
5. ✓ Creates annotated Git tag (e.g., `v0.6.0`)
6. ✓ Pushes tag to repository
7. ✓ Generates release notes from commits
8. ✓ Creates GitHub Release with notes

## Conventional Commits

To ensure proper version bumping, follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

### Feature Commits (MINOR bump)

```bash
feat: add SMS notification support
feat(api): implement rate limiting
feat(ui): add notification dashboard
```

### Bug Fix Commits (PATCH bump)

```bash
fix: resolve email delivery failure
fix(database): prevent connection timeout
fix(frontend): correct date formatting
```

### Other Commit Types (PATCH bump)

```bash
chore: update dependencies
docs: improve API documentation
style: format code with prettier
refactor: simplify notification logic
perf: optimize database queries
test: add unit tests for templates
ci: update GitHub Actions workflow
```

### Breaking Changes (MANUAL bump)

```bash
# In commit message body:
BREAKING CHANGE: removed deprecated v1 API endpoints
```

⚠️ **Breaking changes require manual major version bump** (see below).

## Manual Major Version Bump

Major version bumps (e.g., `v0.9.0` → `v1.0.0`) **must be done manually** as they indicate breaking changes.

### Steps for Manual Major Bump:

1. **Update version in `frontend/package.json`**:
   ```json
   {
     "version": "1.0.0"
   }
   ```

2. **Commit the change**:
   ```bash
   git add frontend/package.json
   git commit -m "chore(release): bump major version to 1.0.0

   BREAKING CHANGE: Removed deprecated v1 API endpoints
   "
   ```

3. **Push to main**:
   ```bash
   git push origin main
   ```

4. **Deploy to production** - The automated release process will create `v1.0.0` tag

## Release Notes

Release notes are **automatically generated** from commit messages and include:

- ✨ **Features**: All `feat:` commits
- 🐛 **Bug Fixes**: All `fix:` commits
- 🔧 **Maintenance**: `chore:`, `docs:`, `refactor:`, etc.
- ⚠️ **Breaking Changes**: Any commits with `BREAKING CHANGE`
- 📝 **Other Changes**: Commits not following conventions

### Example Release Notes

```markdown
# Release v0.6.0

## What's Changed

### ✨ Features
- **api**: implement rate limiting (a1b2c3d) @developer
- add SMS notification support (d4e5f6g) @developer

### 🐛 Bug Fixes
- **database**: prevent connection timeout (g7h8i9j) @developer
- resolve email delivery failure (j0k1l2m) @developer

### 🔧 Maintenance
- **ci**: update GitHub Actions workflow (m3n4o5p)

---

**Deployment Information:**
- Deployed to PROD: 2026-05-29 16:30:00 UTC
- Previous version: v0.5.0
- New version: v0.6.0

**Full Changelog**: https://github.com/bcgov/nr-notify/compare/v0.5.0...v0.6.0
```

## Viewing Releases

All releases are available on the [GitHub Releases page](https://github.com/bcgov/nr-notify/releases).

Each release includes:
- 📋 Auto-generated release notes
- 🏷️ Git tag
- 📅 Deployment timestamp
- 🔗 Link to full changelog

## Troubleshooting

### Tag Already Exists

If a tag already exists for the calculated version, the release creation is **skipped** and a warning is logged. This prevents duplicate releases.

### Release Creation Failed

If the GitHub Release creation fails:

1. Check the workflow logs in GitHub Actions
2. Verify the `GITHUB_TOKEN` has write permissions
3. Manually create the release from the tag if needed

### Wrong Version Bump

If the automated version bump is incorrect:

1. **Fix commit messages** - Ensure they follow Conventional Commits
2. **Manual override** - Manually bump version in `package.json` and commit
3. Next deployment will use the manually set version

## Future Enhancements

Planned improvements to the release process:

- [ ] **Jira Integration**: Auto-generate release notes from Jira tickets
- [ ] **Milestone Reminders**: Notify team when milestone is reached
- [ ] **Pre-release Tags**: Support for alpha/beta/rc versions
- [ ] **Changelog Generation**: Maintain CHANGELOG.md file automatically
- [ ] **Release Validation**: Automated checks before release creation

## References

- [Semantic Versioning](https://semver.org/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github)

## Scripts

### Version Bump Script

Location: `.github/scripts/bump-version.sh`

Usage:
```bash
# Automatic (analyzes commits)
./bump-version.sh auto

# Manual bump
./bump-version.sh major   # 0.5.0 → 1.0.0
./bump-version.sh minor   # 0.5.0 → 0.6.0
./bump-version.sh patch   # 0.5.0 → 0.5.1
```

### Release Notes Script

Location: `.github/scripts/generate-release-notes.sh`

Usage:
```bash
# Generate release notes
./generate-release-notes.sh <previous_tag> <new_version>

# Example
./generate-release-notes.sh v0.5.0 0.6.0
```

---

**Last Updated**: 2026-05-29
