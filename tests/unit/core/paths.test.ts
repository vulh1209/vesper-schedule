import { describe, test, expect, afterEach } from 'bun:test'
import { existsSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { PATHS, repoConfigPath, repoSkillsPath, logDirForDate, ensureDirectories } from '../../../src/core/paths.js'

describe('PATHS constants', () => {
  const home = homedir()
  const base = join(home, '.vesper-schedule')

  test('base dir is under home', () => {
    expect(PATHS.base).toBe(base)
  })

  test('config path', () => {
    expect(PATHS.config).toBe(join(base, 'config.json'))
  })

  test('schedules path', () => {
    expect(PATHS.schedules).toBe(join(base, 'schedules'))
  })

  test('daemon paths', () => {
    expect(PATHS.daemon.pid).toBe(join(base, 'daemon.pid'))
    expect(PATHS.daemon.socket).toBe(join(base, 'daemon.sock'))
    expect(PATHS.daemon.queuePending).toBe(join(base, 'queue-pending.json'))
  })
})

describe('path helpers', () => {
  test('repoConfigPath', () => {
    expect(repoConfigPath('/my/repo')).toBe('/my/repo/.vesper-schedule/config.json')
  })

  test('repoSkillsPath', () => {
    expect(repoSkillsPath('/my/repo')).toBe('/my/repo/.vesper-schedule/skills')
  })

  test('logDirForDate formats date correctly', () => {
    const date = new Date('2026-02-07T10:00:00Z')
    const dir = logDirForDate(date)
    expect(dir).toContain('2026-02-07')
    expect(dir).toContain(PATHS.logs)
  })
})

describe('ensureDirectories', () => {
  test('creates all required directories', () => {
    // This touches real filesystem at ~/.vesper-schedule/
    // Just verify it doesn't throw
    ensureDirectories()
    expect(existsSync(PATHS.base)).toBe(true)
    expect(existsSync(PATHS.schedules)).toBe(true)
    expect(existsSync(PATHS.logs)).toBe(true)
    expect(existsSync(PATHS.sessions)).toBe(true)
    expect(existsSync(PATHS.skills)).toBe(true)
  })
})
