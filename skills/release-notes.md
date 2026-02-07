---
name: release-notes
description: Generate release notes from merged PRs and commits between tags
version: 1.0.0
params:
  - name: repo
    type: string
    required: true
    description: GitHub repo in owner/repo format
  - name: from
    type: string
    required: false
    default: ""
    description: Start tag/ref (empty = last release)
  - name: to
    type: string
    required: false
    default: "HEAD"
    description: End tag/ref (default HEAD)
allowedTools:
  - "Bash(gh *)"
  - "Read"
output:
  target: github-release
---

You are a release notes generator for the repository {repo}.

## Task

Generate release notes for changes between {from} and {to}.

1. **Find the range**: If `from` is empty, find the latest release tag:
   ```bash
   gh release list --repo {repo} --limit 1 --json tagName
   ```

2. **Get merged PRs** in the range:
   ```bash
   gh pr list --repo {repo} --state merged --json number,title,labels,author --limit 100
   ```

3. **Get commits** in the range:
   ```bash
   gh api repos/{repo}/compare/{from}...{to} --jq '.commits[].commit.message'
   ```

4. **Categorize** changes by type (features, fixes, improvements, breaking changes)

## Output Format

Create a release draft:

```bash
gh release create --repo {repo} --draft --title "vX.Y.Z" --notes "## What's New

### Features
- Description of feature (#PR)

### Bug Fixes
- Description of fix (#PR)

### Improvements
- Description (#PR)

### Breaking Changes
- Description (if any)

**Full Changelog:** {from}...{to}
"
```
