import type { SDKMessage } from '@anthropic-ai/claude-code'
import { loadSkill, type LoadedSkill } from '../skills/loader.js'
import { validateSkillParams } from '../skills/validator.js'
import { loadConfig } from '../core/config.js'
import { ensureDirectories } from '../core/paths.js'
import type { WorkerResult } from '../core/types.js'
import { executeSession } from './session.js'

const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 1000

export interface ExecuteSkillOptions {
  skillSlug: string
  params: Record<string, unknown>
  workingDirectory?: string
  resumeSessionId?: string
  timeoutMs?: number
  onMessage?: (message: SDKMessage) => void
}

/** Check if an API error is retryable (transient network/server errors) */
function isRetryableError(error: string): boolean {
  const retryable = [
    'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE',
    'socket hang up', '529', '503', '502', '500',
    'overloaded', 'rate limit', 'too many requests',
  ]
  const lower = error.toLowerCase()
  return retryable.some(s => lower.includes(s.toLowerCase()))
}

/** Sleep for a given number of milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Execute a skill end-to-end:
 * 1. Load & validate skill
 * 2. Validate params
 * 3. Run WorkerSession with timeout and retry (max 3 attempts with backoff)
 * 4. Return sanitized WorkerResult
 */
export async function executeSkill(options: ExecuteSkillOptions): Promise<WorkerResult> {
  const { skillSlug, params, resumeSessionId, onMessage } = options
  ensureDirectories()

  // Load config for timeout
  const configResult = loadConfig()
  const timeoutMs = options.timeoutMs
    ?? (configResult.ok ? configResult.value.daemon.job_timeout_ms : 600_000)

  // Load skill
  const skillResult = loadSkill(skillSlug)
  if (!skillResult.ok) {
    return { ok: false, error: skillResult.error, code: 'skill_error' }
  }
  const skill: LoadedSkill = skillResult.value

  // Validate params
  const paramResult = validateSkillParams(params, skill.metadata.params)
  if (!paramResult.ok) {
    return { ok: false, error: paramResult.error, code: 'skill_error' }
  }

  const workingDirectory = options.workingDirectory ?? process.cwd()

  // Execute with timeout and retry
  let lastError = ''
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1)
      await sleep(backoffMs)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const result = await Promise.race([
        executeSession({
          skill,
          params: paramResult.value,
          workingDirectory,
          resumeSessionId,
          onMessage,
        }),
        new Promise<WorkerResult>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new Error('timeout'))
          })
        }),
      ])

      // If the result is a non-retryable failure or success, return immediately
      if (result.ok || result.code !== 'api_error' || !isRetryableError(result.error)) {
        return result
      }

      // Retryable API error — try again
      lastError = result.error
    } catch (e) {
      if (e instanceof Error && e.message === 'timeout') {
        return { ok: false, error: `Skill execution timed out after ${timeoutMs}ms`, code: 'timeout' }
      }
      const message = e instanceof Error ? e.message : String(e)
      if (!isRetryableError(message)) {
        return { ok: false, error: message, code: 'api_error' }
      }
      lastError = message
    } finally {
      clearTimeout(timer)
    }
  }

  return { ok: false, error: `Failed after ${MAX_RETRIES} retries: ${lastError}`, code: 'api_error' }
}
