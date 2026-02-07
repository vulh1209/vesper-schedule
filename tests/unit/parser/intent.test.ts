import { describe, test, expect } from 'bun:test'
import { tryCommandFastPath } from '../../../src/parser/intent.js'

describe('tryCommandFastPath', () => {
  // Simple commands
  test('status command', () => {
    const result = tryCommandFastPath('status')
    expect(result).toEqual({ type: 'command', command: 'status', args: [] })
  })

  test('STATUS command (case insensitive)', () => {
    const result = tryCommandFastPath('STATUS')
    expect(result).toEqual({ type: 'command', command: 'status', args: [] })
  })

  test('help command', () => {
    const result = tryCommandFastPath('help')
    expect(result).toEqual({ type: 'command', command: 'help', args: [] })
  })

  test('quit command', () => {
    const result = tryCommandFastPath('quit')
    expect(result).toEqual({ type: 'command', command: 'quit', args: [] })
  })

  test('exit command', () => {
    const result = tryCommandFastPath('exit')
    expect(result).toEqual({ type: 'command', command: 'exit', args: [] })
  })

  test('list command', () => {
    const result = tryCommandFastPath('list')
    expect(result).toEqual({ type: 'command', command: 'list', args: [] })
  })

  // Logs
  test('logs command without args', () => {
    const result = tryCommandFastPath('logs')
    expect(result).toEqual({ type: 'command', command: 'logs', args: [] })
  })

  test('log command (singular)', () => {
    const result = tryCommandFastPath('log')
    expect(result).toEqual({ type: 'command', command: 'logs', args: [] })
  })

  test('logs with job ID', () => {
    const result = tryCommandFastPath('logs abc123')
    expect(result).toEqual({ type: 'command', command: 'logs', args: ['abc123'] })
  })

  // Enable/disable
  test('enable command', () => {
    const result = tryCommandFastPath('enable sched-1')
    expect(result).toEqual({ type: 'command', command: 'enable', args: ['sched-1'] })
  })

  test('disable command', () => {
    const result = tryCommandFastPath('disable sched-1')
    expect(result).toEqual({ type: 'command', command: 'disable', args: ['sched-1'] })
  })

  // Delete
  test('delete command', () => {
    const result = tryCommandFastPath('delete sched-1')
    expect(result).toEqual({ type: 'command', command: 'delete', args: ['sched-1'] })
  })

  // Daemon management
  test('daemon start', () => {
    const result = tryCommandFastPath('daemon start')
    expect(result).toEqual({ type: 'command', command: 'daemon', args: ['start'] })
  })

  test('daemon stop', () => {
    const result = tryCommandFastPath('daemon stop')
    expect(result).toEqual({ type: 'command', command: 'daemon', args: ['stop'] })
  })

  test('daemon status', () => {
    const result = tryCommandFastPath('daemon status')
    expect(result).toEqual({ type: 'command', command: 'daemon', args: ['status'] })
  })

  // No match → falls through to NL parsing
  test('natural language returns null', () => {
    expect(tryCommandFastPath('moi sang 9h triage issues')).toBeNull()
  })

  test('partial command returns null', () => {
    expect(tryCommandFastPath('status of the system')).toBeNull()
  })

  test('empty input returns null', () => {
    expect(tryCommandFastPath('')).toBeNull()
  })

  // Whitespace handling
  test('trims whitespace', () => {
    const result = tryCommandFastPath('  status  ')
    expect(result).toEqual({ type: 'command', command: 'status', args: [] })
  })
})
