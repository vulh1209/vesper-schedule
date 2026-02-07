# Vesper Schedule CLI - Brainstorm

**Date:** 2026-02-07
**Status:** Refined
**Author:** Vu Le

---

## What We're Building

**Vesper Schedule** - An open-source CLI tool that lets you chat naturally to schedule and execute automated GitHub workflows. Built as a rich TUI chat REPL powered by Claude Code SDK, it acts as a personal DevOps agent that can:

- Scrape and categorize GitHub issues from any repo
- Analyze issues and suggest fix approaches
- Plan new features from issue descriptions
- Review existing plans and PRs
- Auto-review PRs with inline comments
- Generate release notes/changelogs
- Monitor repo activity and alert on new issues

All output goes directly to GitHub (comments on issues/PRs, creating new issues, PR reviews).

## Target Audience

Open source / public tool for the developer community.

## Architecture: Hybrid CLI + Claude Code Workers

### Overview

```
                          ┌─────────────────────┐
                          │   vesper-schedule    │
                          │                      │
    User ───chat───►      │  [Rich TUI REPL]     │
                          │       │               │
                          │       ▼               │
                          │  [Intent Parser]      │
                          │       │               │
                          │  ┌────┴────┐          │
                          │  ▼         ▼          │
                          │ [Run Now] [Schedule]  │
                          │  │         │          │
                          └──┼─────────┼──────────┘
                             │         │
                             │    ┌────┴──────────┐
                             │    │  Daemon        │
                             │    │  (long-running)│
                             │    │  croner cron   │
                             │    │  sequential Q  │
                             │    └────┬──────────┘
                             │         │
                             ▼         ▼
                      ┌──────────────────────┐
                      │ Claude Code SDK      │
                      │ Worker Session       │
                      │                      │
                      │  • skill prompt      │
                      │  • gh CLI access     │
                      │  • MCP tools         │
                      │  • repo filesystem   │
                      └──────────┬───────────┘
                                 │
                                 ▼
                          [GitHub API]
                     issues, PRs, reviews,
                     labels, releases
```

### Layer Responsibilities

| Layer | Responsibility |
|-------|---------------|
| **Rich TUI REPL** | Chat interface (ink-based), display status/progress, show logs |
| **Intent Parser** | Understand natural language → extract skill + params + schedule |
| **Schedule Manager** | CRUD schedules, persist to disk, manage cron expressions |
| **Daemon** | Long-running background process, execute jobs via sequential queue |
| **Claude Code Workers** | Execute actual tasks with full skill/MCP/gh access |

### Key Architecture Decisions

**Sessions: Hybrid fresh + resume**
- Default: each task spawns a fresh Claude Code SDK session (clean isolation)
- Option to resume a previous session for follow-up tasks (e.g., "tiep tuc review PR #8")
- Session IDs stored in job logs for resumability

**Daemon: Long-running process**
- `vesper-schedule daemon` runs as separate background process
- Uses `croner` for cron scheduling
- Sequential job queue (no parallel execution) - safe, no race conditions
- Communicates with REPL via IPC (unix socket or file-based)

**Auth: gh CLI login**
- Workers rely on `gh auth login` already configured
- No token management needed in vesper-schedule itself
- Simple for users, standard GitHub CLI workflow

**Cost: Claude subscription (Max plan)**
- No built-in budget system
- Relies on Claude CLI subscription limits
- Users manage their own Claude usage

**Multi-repo: Global config + per-repo override**
- `~/.vesper-schedule/config.json` for global settings
- `.vesper-schedule/` in repo root for repo-specific overrides (skills, params)
- Repo config merges on top of global config

## Chat REPL UX

### Interaction Flow

```
$ vesper-schedule

  ╭─ Vesper Schedule v0.1.0 ─────────────────╮
  │ Type naturally to schedule or run tasks.  │
  │ `status` to see running jobs.             │
  │ `help` for commands.                      │
  ╰───────────────────────────────────────────╯

  > moi sang 9h cao issue tu repo sipherxyz/vesper phan loai

  ✓ Created schedule: "Morning issue triage"
    Repo:     sipherxyz/vesper
    Schedule: Every weekday at 9:00 AM
    Skill:    issue-triage
    Next run: 2026-02-08 09:00

  > chay ngay di

  ⠋ Running issue-triage on sipherxyz/vesper...
  ✓ Triaged 12 issues:
    • 5 bugs (2 P0, 3 P1)
    • 4 features
    • 3 questions
    → Comments posted on each issue

  > review PR #45 repo sipherxyz/vesper

  ⠋ Reviewing PR #45...
  ✓ Review posted on PR #45
    • 3 inline comments
    • 1 suggestion
    • Approved with comments

  > status

  ┌──────────────────────┬────────────┬──────────────┬──────────┐
  │ Schedule             │ Repo       │ Next Run     │ Status   │
  ├──────────────────────┼────────────┼──────────────┼──────────┤
  │ Morning issue triage │ sipherxyz/ │ Tomorrow 9AM │ ✓ Active │
  │                      │ vesper     │              │          │
  └──────────────────────┴────────────┴──────────────┴──────────┘

  > quit
```

### Built-in Commands

| Command | Description |
|---------|-------------|
| `status` | Show all schedules and their status |
| `logs [job-id]` | View execution logs |
| `list` | List all saved schedules |
| `enable/disable <id>` | Toggle a schedule |
| `delete <id>` | Remove a schedule |
| `daemon start/stop` | Control background daemon |
| `help` | Show help |
| Everything else | Parsed as natural language chat |

### Rich TUI Features

- **ink-based rendering** for colors, spinners, tables, progress
- **Streaming output** from Claude Code workers shown in real-time
- **Job status indicators** with colors (green=success, yellow=running, red=failed)
- **Interactive confirmations** before destructive actions

## Task Types (Skills)

### Core Skills (v1)

| Skill | Input | GitHub Output |
|-------|-------|---------------|
| **issue-triage** | repo, labels filter, time range | Auto-label issues + summary comment with category + priority |
| **fix-analysis** | repo, issue number | Comment with root cause analysis + suggested fix approach + affected files |
| **feature-plan** | repo, issue number | Comment or new issue with implementation plan (steps, files, considerations) |
| **plan-review** | repo, issue number | Comment with feedback on existing plan (gaps, risks, suggestions) |
| **pr-review** | repo, PR number | PR review with inline code comments + overall assessment |
| **release-notes** | repo, version/tag range | Create GitHub release with categorized changelog |
| **repo-monitor** | repo, check interval | Periodic check for new issues/PRs, post summary of activity |

### Skill File Format

Each skill lives in `skills/<name>.md`:

```markdown
---
name: issue-triage
description: Scrape and categorize GitHub issues
version: 1.0.0
params:
  - name: repo
    type: string
    required: true
    description: GitHub repo (owner/repo format)
  - name: since
    type: string
    default: "24h"
    description: Time range to look back
  - name: labels
    type: string[]
    default: []
    description: Filter by existing labels
output:
  target: github-issue-comment
---

## System Prompt

You are an issue triage agent. For each open issue in {repo}
created in the last {since}:

1. Read the issue title and body
2. Categorize: bug, feature, question, docs, or other
3. Assign priority: P0 (critical), P1 (high), P2 (medium), P3 (low)
4. Post a comment with your analysis
5. Add appropriate labels

Use `gh` CLI for all GitHub operations.
```

### Custom Skills

Users can add custom skills by dropping `.md` files into:
- `~/.vesper-schedule/skills/` (global custom skills)
- `.vesper-schedule/skills/` (repo-specific skills)

Custom skills follow the same format as built-in skills. No registry or npm needed.

## Data Model

```
~/.vesper-schedule/
├── config.json              # Global config
├── schedules/
│   └── <id>.json            # Each saved schedule
├── sessions/
│   └── <session-id>.json    # Saved session refs for resume
├── logs/
│   └── <date>/
│       └── <job-id>.log     # Execution logs
├── skills/                  # User's global custom skills
│   └── custom-skill.md
└── daemon.pid               # PID file for daemon process

<repo>/.vesper-schedule/     # Per-repo overrides
├── config.json              # Repo-specific config
└── skills/                  # Repo-specific skills
    └── repo-skill.md
```

### Config Schema

```json
{
  "default_repo": "sipherxyz/vesper",
  "daemon": {
    "log_level": "info",
    "max_queue_size": 50
  },
  "repl": {
    "theme": "default",
    "language": "vi"
  }
}
```

### Schedule Schema

```json
{
  "id": "abc123",
  "name": "Morning issue triage",
  "cron": "0 9 * * 1-5",
  "skill": "issue-triage",
  "params": {
    "repo": "sipherxyz/vesper",
    "labels": ["bug", "enhancement"],
    "since": "24h"
  },
  "enabled": true,
  "created_at": "2026-02-07T09:00:00Z",
  "last_run": "2026-02-07T09:00:15Z",
  "last_session_id": "session_xyz789",
  "last_status": "success"
}
```

## Resolved Questions

| Question | Decision | Rationale |
|----------|----------|-----------|
| GitHub auth | `gh auth login` | Simple, standard, no token management needed |
| Concurrency | Sequential queue | Safe, no race conditions, predictable resource usage |
| Cost control | Claude subscription limits | No built-in budget, rely on Max plan limits |
| Multi-repo | Global + per-repo override | Flexible, supports both single and multi-repo workflows |
| Issue triage logic | Labels + summary comment | Both structured (labels) and human-readable (summary) |
| Custom skills | Drop-in `.md` files | Simple, no registry, community can share via git |

## Out of Scope (v1)

- Web UI / dashboard
- Team collaboration features
- Custom MCP server management in CLI
- Self-hosted deployment / cloud mode
- Slack/Discord/Telegram notifications
- Parallel job execution
- Budget/cost tracking

## Next Steps

Run `/workflows:plan` to create detailed implementation plan.
