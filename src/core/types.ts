// Branded types — prevent accidentally passing a ScheduleId where a JobId is expected
export type ScheduleId = string & { readonly __brand: 'ScheduleId' }
export type JobId = string & { readonly __brand: 'JobId' }
export type SessionId = string & { readonly __brand: 'SessionId' }
export type GitHubRepo = string & { readonly __brand: 'GitHubRepo' }

export function scheduleId(raw: string): ScheduleId {
  return raw as ScheduleId
}
export function jobId(raw: string): JobId {
  return raw as JobId
}
export function sessionId(raw: string): SessionId {
  return raw as SessionId
}
export function gitHubRepo(raw: string): GitHubRepo {
  if (!/^[\w.-]+\/[\w.-]+$/.test(raw)) {
    throw new Error(`Invalid GitHub repo format: "${raw}" (expected "owner/repo")`)
  }
  return raw as GitHubRepo
}

// Result pattern — use over exceptions for fallible operations
export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok
}
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok
}

// Skill source precedence
export type SkillSource = 'builtin' | 'global' | 'repo'

// Schedule status
export type ScheduleStatus = 'active' | 'paused' | 'error'

// Job status
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed'

// Worker result
export type WorkerResult =
  | { ok: true; sessionId: string; cost: number; duration: number; output: string }
  | { ok: false; error: string; code: 'timeout' | 'api_error' | 'skill_error' | 'cancelled' }

// IPC response
export type IpcResponse<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string }
