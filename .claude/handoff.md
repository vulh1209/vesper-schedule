# Session Handoff — vesper-schedule

## Status: Phase 1 COMPLETE, Phase 2 NEXT

**Date:** 2026-02-07
**Branch:** `feat/phase-1-foundation` (PR #1: https://github.com/vulh1209/vesper-schedule/pull/1)
**Repo:** https://github.com/vulh1209/vesper-schedule

## What's Done (Phase 1)

All Phase 1 items are checked off in the plan. Key files:

| File | Purpose |
|------|---------|
| `src/core/types.ts` | Branded types (ScheduleId, JobId, SessionId, GitHubRepo), Result<T,E> pattern |
| `src/core/paths.ts` | ~/.vesper-schedule/ paths, ensureDirectories() |
| `src/core/schemas.ts` | Zod schemas: ConfigSchema, ScheduleSchema, SkillFrontmatterSchema, IpcMessageSchema |
| `src/core/config.ts` | loadConfig() with global + per-repo deep merge |
| `src/core/setup.ts` | checkSetup(), runFirstTimeSetup() |
| `src/skills/loader.ts` | loadAllSkills(), loadSkill() with precedence (repo > global > builtin) |
| `src/skills/validator.ts` | validateSkillParams() with shell metachar rejection |
| `src/cli/index.ts` | Commander CLI: skills list/show, daemon start/stop/status, schedules list, run |
| `skills/*.md` | 7 built-in skills: issue-triage, fix-analysis, feature-plan, plan-review, pr-review, release-notes, repo-monitor |

**Verified:**
- 13/13 Phase 1 checks pass (`bun run tests/verify-phase1.ts`)
- TypeScript strict mode compiles clean
- ink + Bun compatibility confirmed (process.stdin.resume() workaround works)

## What's Next (Phase 2: Claude Code Workers)

**Goal:** Execute skills via Claude Code SDK, post results to GitHub

### Files to create:

1. **`src/worker/session.ts`** — WorkerSession class wrapping `@anthropic-ai/claude-code` SDK
   - Build prompt from skill template + params (safe interpolation)
   - Fresh session per job, resume via stored session_id
   - Store sessions at `~/.vesper-schedule/sessions/<id>.json`
   - Use `allowedTools` from skill frontmatter (default: `['Bash(gh *)', 'Read']`)

2. **`src/worker/executor.ts`** — Skill executor
   - Validate params via `validateSkillParams()` before execution
   - Timeout handling (10 min default from config)
   - Return `WorkerResult` type (already defined in types.ts)

3. **`src/worker/github-output.ts`** — GitHub posting with idempotency
   - Embed `<!--vesper-job:${jobId}-->` markers in comments
   - Check for existing marker before posting (prevent duplicates)

4. **`src/worker/sanitize.ts`** — Log sanitization
   - Strip `ghp_*`, `gho_*`, `github_pat_*` patterns from all output

### Key references from the plan:

- Worker session code: plan lines 332-377 (WorkerSession class)
- Security: restrict allowedTools per skill (plan lines 389-401)
- Template injection prevention: validate params, reject shell metacharacters (plan lines 404-421)
- Result type: already defined in `src/core/types.ts` as `WorkerResult`
- GitHub output idempotency: plan lines 454-478
- Token sanitization: plan lines 496-502

### SDK package:
- Installed as `@anthropic-ai/claude-code` (v1.0.128)
- Import: `import { ClaudeCode } from '@anthropic-ai/claude-code'`

### Success criteria:
- Can run `issue-triage` skill and see labeled issues + comments on GitHub
- Session resume works for follow-up prompts
- Duplicate posts prevented after re-run
- Workers restricted to `allowedTools` declared in skill

## Important Notes

- **Plan file:** `docs/plans/2026-02-07-feat-vesper-schedule-cli-plan.md` — contains full architecture, research insights, race condition analysis, security mitigations
- **Workflow command:** User invoked `/workflows:work` — continue using that workflow pattern (task tracking, incremental commits, update plan checkboxes)
- **Commit style:** Use `/commit` skill (no Claude attribution in commits)
- **TypeScript strict mode:** `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` all enabled
