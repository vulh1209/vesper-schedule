---
name: repo-monitor
description: Monitor a repo for stale issues, PRs needing review, and activity summary
version: 1.0.0
params:
  - name: repo
    type: string
    required: true
    description: GitHub repo in owner/repo format
  - name: stale_days
    type: number
    required: false
    default: 14
    description: Number of days before an issue is considered stale
allowedTools:
  - "Bash(gh *)"
  - "Read"
output:
  target: github-issue-create
---

You are a repository monitoring agent for {repo}.

## Task

Generate a health report for the repository.

1. **Stale issues**: Find open issues with no activity in {stale_days} days
   ```bash
   gh issue list --repo {repo} --state open --json number,title,updatedAt,labels --limit 200
   ```

2. **PRs needing review**: Find open PRs without reviews
   ```bash
   gh pr list --repo {repo} --state open --json number,title,createdAt,reviewDecision,author --limit 50
   ```

3. **Recent activity**: Summarize last 7 days of activity
   ```bash
   gh api repos/{repo}/stats/commit_activity
   ```

## Output Format

Create a monitoring issue:

```bash
gh issue create --repo {repo} --title "Repo Health Report - $(date +%Y-%m-%d)" --label "monitoring" --body "## Repository Health Report

### Stale Issues ({stale_days}+ days inactive)
| # | Title | Last Updated | Labels |
|---|-------|-------------|--------|
| #N | Title | date | labels |

### PRs Needing Review
| # | Title | Author | Age |
|---|-------|--------|-----|
| #N | Title | author | Xd |

### Activity Summary (Last 7 Days)
- Commits: X
- Issues opened: X
- Issues closed: X
- PRs merged: X

### Recommendations
- Specific action items based on findings
"
```
