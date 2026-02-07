# vesper-schedule

CLI tool for scheduling and executing GitHub automation with Claude Code SDK. Chat naturally in Vietnamese or English to schedule recurring tasks like issue triage, PR review, and release notes generation.

## Prerequisites

- [Bun](https://bun.sh) v1.0+
- [Claude CLI](https://docs.anthropic.com/en/docs/claude-cli) with active subscription
- [GitHub CLI](https://cli.github.com) (`gh auth login`)
- Git

## Installation

```sh
git clone https://github.com/vulh1209/vesper-schedule.git
cd vesper-schedule
bun install
```

## Quick Start

```sh
# List available skills
bun run dev -- skills list

# Run a skill immediately
bun run dev -- run issue-triage --repo owner/repo

# Start the REPL
bun run dev

# Start the background daemon
bun run dev -- daemon start
```

## Architecture

```
[Rich TUI REPL] <--unix socket--> [Daemon]
      |                              |
      v                              |
[Intent Parser]                 [Cron Queue]
      |                         (sequential)
  +---+---+                          |
  v       v                          v
[Run Now] [Schedule]         Claude Code SDK
                                     |
                                     v
                              [GitHub API]
```

**Components:**

- **REPL** — ink-based terminal UI with chat interface
- **Daemon** — background process with cron scheduler and job queue
- **Workers** — Claude Code SDK sessions executing skill prompts
- **IPC** — Unix socket with NDJSON framing for REPL-daemon communication

## CLI Commands

### REPL (interactive)

```sh
vesper-schedule
```

Type commands or natural language:

| Input | Action |
|-------|--------|
| `status` | Show daemon and queue status |
| `list` | List all schedules |
| `help` | Show available commands |
| `logs [job-id]` | View execution logs |
| `enable <id>` | Enable a schedule |
| `disable <id>` | Disable a schedule |
| `delete <id>` | Delete a schedule |
| `daemon start\|stop\|status` | Manage daemon |
| `quit` | Exit REPL |

Natural language (Vietnamese/English):

```
moi sang 9h triage issues repo sipherxyz/vesper
```

### Skills

```sh
# List all available skills
vesper-schedule skills list [--json]

# Show skill details
vesper-schedule skills show issue-triage [--json]
```

### Run a Skill

```sh
vesper-schedule run <skill> [options]

Options:
  --repo <owner/repo>      GitHub repository
  --param <key=value>      Skill parameters (repeatable)
  --json                   JSON output
  --timeout <ms>           Execution timeout
  --resume <sessionId>     Resume existing session
```

### Schedules

```sh
# List schedules
vesper-schedule schedules list [--json]

# Create a schedule
vesper-schedule schedules create \
  --skill issue-triage \
  --cron "0 9 * * 1-5" \
  --name "Morning triage" \
  --param repo=owner/repo

# Enable/disable/delete
vesper-schedule schedules enable <id>
vesper-schedule schedules disable <id>
vesper-schedule schedules delete <id>
```

### Daemon

```sh
vesper-schedule daemon start     # Start in foreground
vesper-schedule daemon stop      # Stop running daemon
vesper-schedule daemon status    # Show daemon status [--json]
```

## Built-in Skills

| Skill | Description | Output |
|-------|-------------|--------|
| `issue-triage` | Categorize, prioritize, and label GitHub issues | Issue comments |
| `pr-review` | Code review for quality, correctness, and security | PR reviews |
| `fix-analysis` | Analyze bug reports and propose fixes | Issue comments |
| `feature-plan` | Break down feature requests into implementation steps | Issue comments |
| `plan-review` | Review project plans for feasibility | Issue comments |
| `release-notes` | Generate release notes from merged PRs | GitHub releases |
| `repo-monitor` | Monitor repository health metrics | Issue comments |

## Writing Custom Skills

Create a `.md` file with YAML frontmatter:

```markdown
---
name: my-skill
description: What this skill does
version: 1.0.0
params:
  - name: repo
    type: string
    required: true
    description: GitHub repo in owner/repo format
  - name: since
    type: string
    required: false
    default: "24h"
    description: Time range
allowedTools:
  - "Bash(gh *)"
  - "Read"
output:
  target: github-issue-comment
---

You are an automation agent for {repo}.

## Task

Your instructions here. Use {param_name} for parameter substitution.
Use `gh` CLI for all GitHub operations.
```

**Skill locations** (later overrides earlier):

1. `skills/` — built-in skills
2. `~/.vesper-schedule/skills/` — global custom skills
3. `.vesper-schedule/skills/` — per-repo skills

**Output targets:** `github-issue-comment`, `github-pr-review`, `github-release`, `github-issue-create`, `github-label`

**Parameter types:** `string`, `number`, `boolean`, `string[]`

## Configuration

Global config: `~/.vesper-schedule/config.json`
Per-repo config: `.vesper-schedule/config.json` (overrides global)

```json
{
  "default_repo": "owner/repo",
  "daemon": {
    "log_level": "info",
    "max_queue_size": 50,
    "job_timeout_ms": 600000
  },
  "repl": {
    "language": "en"
  }
}
```

| Setting | Default | Description |
|---------|---------|-------------|
| `default_repo` | — | Default GitHub repository |
| `daemon.log_level` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `daemon.max_queue_size` | `50` | Maximum queued jobs |
| `daemon.job_timeout_ms` | `600000` | Job timeout (10 min) |
| `daemon.socket_path` | — | Custom socket path |
| `repl.language` | `en` | REPL language: `en`, `vi` |

## Development

```sh
# Run in development
bun run dev

# Run tests
bun test

# Type check
bun run typecheck
```

## License

Apache-2.0
