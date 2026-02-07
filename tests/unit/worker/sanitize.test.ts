import { describe, test, expect } from 'bun:test'
import { sanitizeOutput } from '../../../src/worker/sanitize.js'

describe('sanitizeOutput', () => {
  test('redacts ghp_ tokens', () => {
    const input = 'Authorization: token ghp_abcdefghijklmnopqrstuvwxyz0123456789'
    const result = sanitizeOutput(input)
    expect(result).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789')
    expect(result).toContain('ghp_***REDACTED***')
  })

  test('redacts gho_ tokens', () => {
    const input = 'token gho_abcdefghijklmnopqrstuvwxyz0123456789'
    const result = sanitizeOutput(input)
    expect(result).not.toContain('gho_abcdefghijklmnopqrstuvwxyz0123456789')
    expect(result).toContain('gho_***REDACTED***')
  })

  test('redacts github_pat_ tokens', () => {
    const token = 'github_pat_' + 'a'.repeat(82)
    const input = `Using token: ${token}`
    const result = sanitizeOutput(input)
    expect(result).not.toContain(token)
    expect(result).toContain('github_pat_***REDACTED***')
  })

  test('redacts multiple tokens in same string', () => {
    const input = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789 and gho_abcdefghijklmnopqrstuvwxyz0123456789'
    const result = sanitizeOutput(input)
    expect(result).toBe('ghp_***REDACTED*** and gho_***REDACTED***')
  })

  test('leaves clean output unchanged', () => {
    const input = 'No tokens here, just normal output'
    expect(sanitizeOutput(input)).toBe(input)
  })

  test('handles empty string', () => {
    expect(sanitizeOutput('')).toBe('')
  })

  test('does not redact partial token matches', () => {
    // ghp_ followed by less than 36 chars should not match
    const input = 'ghp_short'
    expect(sanitizeOutput(input)).toBe(input)
  })
})
