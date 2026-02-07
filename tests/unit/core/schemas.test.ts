import { describe, test, expect } from 'bun:test'
import {
  SkillParamSchema,
  SkillFrontmatterSchema,
  ConfigSchema,
  DaemonConfigSchema,
  ReplConfigSchema,
  ScheduleSchema,
  IpcMessageSchema,
} from '../../../src/core/schemas.js'

describe('SkillParamSchema', () => {
  test('parses valid param', () => {
    const result = SkillParamSchema.parse({
      name: 'repo',
      type: 'string',
      required: true,
      description: 'GitHub repo',
    })
    expect(result.name).toBe('repo')
    expect(result.type).toBe('string')
    expect(result.required).toBe(true)
  })

  test('applies default for required', () => {
    const result = SkillParamSchema.parse({
      name: 'since',
      type: 'string',
      description: 'Time range',
    })
    expect(result.required).toBe(false)
  })

  test('allows optional default value', () => {
    const result = SkillParamSchema.parse({
      name: 'since',
      type: 'string',
      description: 'Time range',
      default: '24h',
    })
    expect(result.default).toBe('24h')
  })

  test('rejects invalid type', () => {
    expect(() =>
      SkillParamSchema.parse({
        name: 'x',
        type: 'object',
        description: 'nope',
      }),
    ).toThrow()
  })
})

describe('SkillFrontmatterSchema', () => {
  test('parses complete frontmatter', () => {
    const result = SkillFrontmatterSchema.parse({
      name: 'issue-triage',
      description: 'Triage issues',
      version: '1.0.0',
      params: [{ name: 'repo', type: 'string', required: true, description: 'Repo' }],
      allowedTools: ['Bash(gh *)', 'Read'],
      output: { target: 'github-issue-comment' },
    })
    expect(result.name).toBe('issue-triage')
    expect(result.params).toHaveLength(1)
    expect(result.output.target).toBe('github-issue-comment')
  })

  test('applies defaults for optional fields', () => {
    const result = SkillFrontmatterSchema.parse({
      name: 'test',
      description: 'Test skill',
      output: { target: 'github-issue-comment' },
    })
    expect(result.version).toBe('1.0.0')
    expect(result.params).toEqual([])
    expect(result.allowedTools).toEqual(['Bash(gh *)', 'Read'])
  })

  test('rejects invalid output target', () => {
    expect(() =>
      SkillFrontmatterSchema.parse({
        name: 'test',
        description: 'Test',
        output: { target: 'slack-message' },
      }),
    ).toThrow()
  })

  test('accepts all valid output targets', () => {
    const targets = [
      'github-issue-comment',
      'github-pr-review',
      'github-release',
      'github-issue-create',
      'github-label',
    ] as const
    for (const target of targets) {
      const result = SkillFrontmatterSchema.parse({
        name: 'test',
        description: 'Test',
        output: { target },
      })
      expect(result.output.target).toBe(target)
    }
  })
})

describe('ConfigSchema', () => {
  test('parses empty config with all defaults', () => {
    const result = ConfigSchema.parse({})
    expect(result.daemon.log_level).toBe('info')
    expect(result.daemon.max_queue_size).toBe(50)
    expect(result.daemon.job_timeout_ms).toBe(600_000)
    expect(result.repl.language).toBe('en')
    expect(result.default_repo).toBeUndefined()
  })

  test('parses full config', () => {
    const result = ConfigSchema.parse({
      default_repo: 'owner/repo',
      daemon: { log_level: 'debug', max_queue_size: 100, job_timeout_ms: 300_000 },
      repl: { language: 'vi' },
    })
    expect(result.default_repo).toBe('owner/repo')
    expect(result.daemon.log_level).toBe('debug')
    expect(result.daemon.max_queue_size).toBe(100)
    expect(result.repl.language).toBe('vi')
  })

  test('rejects invalid log level', () => {
    expect(() =>
      ConfigSchema.parse({ daemon: { log_level: 'verbose' } }),
    ).toThrow()
  })

  test('rejects invalid language', () => {
    expect(() =>
      ConfigSchema.parse({ repl: { language: 'fr' } }),
    ).toThrow()
  })
})

describe('ScheduleSchema', () => {
  test('parses valid schedule', () => {
    const result = ScheduleSchema.parse({
      id: 'sched-1',
      name: 'Morning triage',
      cron: '0 9 * * 1-5',
      skill: 'issue-triage',
      params: { repo: 'owner/repo' },
      enabled: true,
      created_at: '2026-02-07T00:00:00.000Z',
    })
    expect(result.id).toBe('sched-1')
    expect(result.enabled).toBe(true)
  })

  test('applies default for enabled and params', () => {
    const result = ScheduleSchema.parse({
      id: 'sched-2',
      name: 'Test',
      cron: '* * * * *',
      skill: 'test',
      created_at: '2026-02-07T00:00:00.000Z',
    })
    expect(result.enabled).toBe(true)
    expect(result.params).toEqual({})
  })

  test('rejects invalid last_status', () => {
    expect(() =>
      ScheduleSchema.parse({
        id: 'x',
        name: 'x',
        cron: '* * * * *',
        skill: 'x',
        created_at: '2026-02-07T00:00:00.000Z',
        last_status: 'running',
      }),
    ).toThrow()
  })
})

describe('IpcMessageSchema', () => {
  test('parses schedule:list message', () => {
    const result = IpcMessageSchema.parse({
      type: 'schedule:list',
      id: 'req-1',
      payload: {},
    })
    expect(result.type).toBe('schedule:list')
    expect(result.version).toBe(1)
    expect(result.id).toBe('req-1')
  })

  test('parses job:run-now message', () => {
    const result = IpcMessageSchema.parse({
      type: 'job:run-now',
      id: 'req-2',
      payload: { skill: 'issue-triage', params: { repo: 'a/b' } },
    })
    expect(result.type).toBe('job:run-now')
    if (result.type === 'job:run-now') {
      expect(result.payload.skill).toBe('issue-triage')
    }
  })

  test('rejects unknown message type', () => {
    expect(() =>
      IpcMessageSchema.parse({
        type: 'unknown:action',
        id: 'req-3',
        payload: {},
      }),
    ).toThrow()
  })
})
