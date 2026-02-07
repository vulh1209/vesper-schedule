import { query, type SDKMessage } from '@anthropic-ai/claude-code'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { PATHS } from '../core/paths.js'
import type { LoadedSkill } from '../skills/loader.js'
import type { WorkerResult, SessionId } from '../core/types.js'
import { sessionId } from '../core/types.js'
import { sanitizeOutput } from './sanitize.js'

interface SessionRecord {
  sessionId: string
  skill: string
  params: Record<string, unknown>
  createdAt: string
  expiresAt: string
}

/** Persist a session reference for later resume */
function saveSession(id: SessionId, skill: string, params: Record<string, unknown>): void {
  const record: SessionRecord = {
    sessionId: id,
    skill,
    params,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
  }
  const filePath = join(PATHS.sessions, `${id}.json`)
  writeFileSync(filePath, JSON.stringify(record, null, 2))
}

/** Load a stored session reference */
export function loadSession(id: string): SessionRecord | null {
  const filePath = join(PATHS.sessions, `${id}.json`)
  if (!existsSync(filePath)) return null
  try {
    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as SessionRecord
  } catch {
    return null
  }
}

/** Build a prompt string from skill template + validated params */
export function buildPrompt(
  skillContent: string,
  params: Record<string, unknown>,
): string {
  return skillContent.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key]
    if (value === undefined) return match // Leave unmatched placeholders as-is
    return String(value)
  })
}

export interface WorkerSessionConfig {
  skill: LoadedSkill
  params: Record<string, unknown>
  workingDirectory: string
  resumeSessionId?: string
  onMessage?: (message: SDKMessage) => void
}

/**
 * Execute a skill via Claude Code SDK.
 * Returns a WorkerResult with session info, cost, and output.
 */
export async function executeSession(config: WorkerSessionConfig): Promise<WorkerResult> {
  const { skill, params, workingDirectory, resumeSessionId, onMessage } = config
  const prompt = buildPrompt(skill.content, params)
  const startTime = Date.now()

  try {
    const conversation = query({
      prompt,
      options: {
        cwd: workingDirectory,
        allowedTools: skill.metadata.allowedTools,
        appendSystemPrompt: 'Use `gh` CLI for all GitHub operations. Post results directly. Do not ask for confirmation.',
        permissionMode: 'bypassPermissions',
        resume: resumeSessionId,
      },
    })

    let resultSessionId = ''
    let resultOutput = ''
    let resultCost = 0
    let resultDuration = 0

    for await (const message of conversation) {
      if (onMessage) onMessage(message)

      if (message.type === 'result') {
        resultSessionId = message.session_id
        resultDuration = message.duration_ms
        resultCost = message.total_cost_usd

        if (message.subtype === 'success') {
          resultOutput = sanitizeOutput(message.result)
        } else {
          // error_max_turns or error_during_execution
          return {
            ok: false,
            error: sanitizeOutput(`Session ended with: ${message.subtype}`),
            code: message.subtype === 'error_max_turns' ? 'timeout' : 'skill_error',
          }
        }
      }
    }

    // Save session for potential resume
    const sid = sessionId(resultSessionId)
    if (resultSessionId) {
      saveSession(sid, skill.slug, params)
    }

    return {
      ok: true,
      sessionId: resultSessionId,
      cost: resultCost,
      duration: resultDuration + (Date.now() - startTime - resultDuration), // wall clock
      output: resultOutput,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      error: sanitizeOutput(message),
      code: 'api_error',
    }
  }
}

/**
 * Resume an existing session with a follow-up prompt.
 */
export async function resumeSession(
  existingSessionId: string,
  followUpPrompt: string,
  workingDirectory: string,
  onMessage?: (message: SDKMessage) => void,
): Promise<WorkerResult> {
  try {
    const conversation = query({
      prompt: followUpPrompt,
      options: {
        cwd: workingDirectory,
        resume: existingSessionId,
        permissionMode: 'bypassPermissions',
      },
    })

    let resultOutput = ''
    let resultCost = 0
    let resultDuration = 0
    let resultSessionId = existingSessionId

    for await (const message of conversation) {
      if (onMessage) onMessage(message)

      if (message.type === 'result') {
        resultSessionId = message.session_id
        resultDuration = message.duration_ms
        resultCost = message.total_cost_usd

        if (message.subtype === 'success') {
          resultOutput = sanitizeOutput(message.result)
        } else {
          return {
            ok: false,
            error: sanitizeOutput(`Resume ended with: ${message.subtype}`),
            code: message.subtype === 'error_max_turns' ? 'timeout' : 'skill_error',
          }
        }
      }
    }

    return {
      ok: true,
      sessionId: resultSessionId,
      cost: resultCost,
      duration: resultDuration,
      output: resultOutput,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      error: sanitizeOutput(message),
      code: 'api_error',
    }
  }
}
