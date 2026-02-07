import type { SDKMessage } from '@anthropic-ai/claude-code'
import { loadSkill, type LoadedSkill } from '../skills/loader.js'
import { validateSkillParams } from '../skills/validator.js'
import { loadConfig } from '../core/config.js'
import { ensureDirectories } from '../core/paths.js'
import type { WorkerResult } from '../core/types.js'
import { executeSession } from './session.js'

export interface ExecuteSkillOptions {
  skillSlug: string
  params: Record<string, unknown>
  workingDirectory?: string
  resumeSessionId?: string
  timeoutMs?: number
  onMessage?: (message: SDKMessage) => void
}

/**
 * Execute a skill end-to-end:
 * 1. Load & validate skill
 * 2. Validate params
 * 3. Run WorkerSession with timeout
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

  // Execute with timeout
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
    return result
  } catch (e) {
    if (e instanceof Error && e.message === 'timeout') {
      return { ok: false, error: `Skill execution timed out after ${timeoutMs}ms`, code: 'timeout' }
    }
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: message, code: 'api_error' }
  } finally {
    clearTimeout(timer)
  }
}
