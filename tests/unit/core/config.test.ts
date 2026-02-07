import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadConfig } from '../../../src/core/config.js'

// We can't easily test the global config path without mocking,
// but we CAN test the repo-local config merge behavior
// by providing a repoPath with a .vesper-schedule/config.json

describe('loadConfig', () => {
  const testDir = join(tmpdir(), `vesper-test-config-${Date.now()}`)
  const repoDir = join(testDir, 'repo')
  const repoConfigDir = join(repoDir, '.vesper-schedule')

  beforeEach(() => {
    mkdirSync(repoConfigDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  })

  test('returns ok with defaults when no config files exist', () => {
    const result = loadConfig()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.daemon.log_level).toBe('info')
      expect(result.value.daemon.max_queue_size).toBe(50)
      expect(result.value.repl.language).toBe('en')
    }
  })

  test('merges repo-local config over defaults', () => {
    writeFileSync(
      join(repoConfigDir, 'config.json'),
      JSON.stringify({ repl: { language: 'vi' } }),
    )
    const result = loadConfig(repoDir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.repl.language).toBe('vi')
      // Defaults still present
      expect(result.value.daemon.log_level).toBe('info')
    }
  })

  test('repo config overrides nested daemon settings', () => {
    writeFileSync(
      join(repoConfigDir, 'config.json'),
      JSON.stringify({ daemon: { log_level: 'debug' } }),
    )
    const result = loadConfig(repoDir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.daemon.log_level).toBe('debug')
      // Other daemon defaults preserved
      expect(result.value.daemon.max_queue_size).toBe(50)
    }
  })

  test('returns ok when repo config does not exist', () => {
    const result = loadConfig('/nonexistent/path')
    expect(result.ok).toBe(true)
  })

  test('returns ok when repo config is malformed JSON', () => {
    writeFileSync(join(repoConfigDir, 'config.json'), '{not valid json')
    const result = loadConfig(repoDir)
    // readJsonSafe returns {} on parse error, so defaults apply
    expect(result.ok).toBe(true)
  })
})
