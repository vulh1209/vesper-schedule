import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// We test the logger functions indirectly since they write to PATHS.logs
// which is based on the real home directory. For unit tests, we test
// the cleanupOldLogs logic by creating old directories.

import { writeJobLog, writeDaemonLog, cleanupOldLogs } from '../../../src/daemon/logger.js'
import { PATHS } from '../../../src/core/paths.js'

describe('writeJobLog', () => {
  test('creates log file with structured entry', () => {
    const testJobId = `test-job-${Date.now()}`
    writeJobLog(testJobId, 'info', 'Test message', { key: 'value' })

    // Verify the file was created in today's log dir
    const today = new Date().toISOString().split('T')[0]
    const logPath = join(PATHS.logs, today!, `${testJobId}.log`)
    expect(existsSync(logPath)).toBe(true)

    const content = readFileSync(logPath, 'utf-8')
    const entry = JSON.parse(content.trim())
    expect(entry.level).toBe('info')
    expect(entry.message).toBe('Test message')
    expect(entry.jobId).toBe(testJobId)
    expect(entry.data).toEqual({ key: 'value' })

    // Cleanup
    rmSync(logPath)
  })
})

describe('writeDaemonLog', () => {
  test('writes to daemon.log', () => {
    writeDaemonLog('warn', 'Daemon warning')

    const today = new Date().toISOString().split('T')[0]
    const logPath = join(PATHS.logs, today!, 'daemon.log')
    expect(existsSync(logPath)).toBe(true)

    const content = readFileSync(logPath, 'utf-8')
    const lines = content.trim().split('\n')
    const lastLine = lines[lines.length - 1]!
    const entry = JSON.parse(lastLine)
    expect(entry.level).toBe('warn')
    expect(entry.message).toBe('Daemon warning')
  })
})

describe('cleanupOldLogs', () => {
  test('removes directories older than 30 days', () => {
    // Create an old log directory
    const oldDate = new Date()
    oldDate.setDate(oldDate.getDate() - 31)
    const oldDateStr = oldDate.toISOString().split('T')[0]!
    const oldDir = join(PATHS.logs, oldDateStr)

    mkdirSync(oldDir, { recursive: true })
    writeFileSync(join(oldDir, 'test.log'), 'old log')

    const removed = cleanupOldLogs()
    expect(removed).toBeGreaterThanOrEqual(1)
    expect(existsSync(oldDir)).toBe(false)
  })

  test('preserves recent directories', () => {
    const today = new Date().toISOString().split('T')[0]!
    const todayDir = join(PATHS.logs, today)
    mkdirSync(todayDir, { recursive: true })

    cleanupOldLogs()
    expect(existsSync(todayDir)).toBe(true)
  })
})
