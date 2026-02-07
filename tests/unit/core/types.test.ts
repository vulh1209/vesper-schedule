import { describe, test, expect } from 'bun:test'
import {
  scheduleId, jobId, sessionId, gitHubRepo,
  ok, err, isOk, isErr,
  type ScheduleId, type JobId, type SessionId, type GitHubRepo,
  type Result,
} from '../../../src/core/types.js'

describe('Branded types', () => {
  test('scheduleId creates a branded string', () => {
    const id = scheduleId('abc123')
    expect(id).toBe('abc123')
    // Type-level: ScheduleId is assignable to string
    const s: string = id
    expect(typeof s).toBe('string')
  })

  test('jobId creates a branded string', () => {
    const id = jobId('job-1')
    expect(id).toBe('job-1')
  })

  test('sessionId creates a branded string', () => {
    const id = sessionId('ses-1')
    expect(id).toBe('ses-1')
  })

  test('gitHubRepo validates owner/repo format', () => {
    const repo = gitHubRepo('owner/repo')
    expect(repo).toBe('owner/repo')
  })

  test('gitHubRepo accepts dots, hyphens, underscores', () => {
    expect(gitHubRepo('my-org/my.repo_v2')).toBe('my-org/my.repo_v2')
  })

  test('gitHubRepo throws on invalid format', () => {
    expect(() => gitHubRepo('just-a-name')).toThrow('Invalid GitHub repo format')
    expect(() => gitHubRepo('')).toThrow('Invalid GitHub repo format')
    expect(() => gitHubRepo('a/b/c')).toThrow('Invalid GitHub repo format')
    expect(() => gitHubRepo('owner/ repo')).toThrow('Invalid GitHub repo format')
  })
})

describe('Result pattern', () => {
  test('ok() creates a success result', () => {
    const result = ok(42)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toBe(42)
    }
  })

  test('err() creates a failure result', () => {
    const result = err('something failed')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('something failed')
    }
  })

  test('isOk() narrows to success', () => {
    const result: Result<number> = ok(10)
    expect(isOk(result)).toBe(true)
    expect(isErr(result)).toBe(false)
  })

  test('isErr() narrows to failure', () => {
    const result: Result<number> = err('nope')
    expect(isOk(result)).toBe(false)
    expect(isErr(result)).toBe(true)
  })

  test('ok with complex value', () => {
    const result = ok({ id: 1, name: 'test' })
    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value).toEqual({ id: 1, name: 'test' })
    }
  })

  test('err with undefined (void result)', () => {
    const result = ok(undefined)
    expect(isOk(result)).toBe(true)
  })
})
