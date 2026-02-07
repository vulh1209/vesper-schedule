import { describe, test, expect } from 'bun:test'
import { validateSkillParams } from '../../../src/skills/validator.js'
import type { SkillParam } from '../../../src/core/schemas.js'

const SCHEMA: SkillParam[] = [
  { name: 'repo', type: 'string', required: true, description: 'GitHub repo' },
  { name: 'since', type: 'string', required: false, default: '24h', description: 'Time range' },
  { name: 'count', type: 'number', required: false, description: 'Max items' },
  { name: 'verbose', type: 'boolean', required: false, description: 'Verbose output' },
  { name: 'labels', type: 'string[]', required: false, description: 'Label filter' },
]

describe('validateSkillParams', () => {
  test('validates correct params', () => {
    const result = validateSkillParams({ repo: 'owner/repo' }, SCHEMA)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.repo).toBe('owner/repo')
      // Default applied
      expect(result.value.since).toBe('24h')
    }
  })

  test('returns error for missing required param', () => {
    const result = validateSkillParams({}, SCHEMA)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('repo')
      expect(result.error).toContain('required')
    }
  })

  test('applies default for optional param', () => {
    const result = validateSkillParams({ repo: 'a/b' }, SCHEMA)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.since).toBe('24h')
    }
  })

  test('overrides default when value provided', () => {
    const result = validateSkillParams({ repo: 'a/b', since: '7d' }, SCHEMA)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.since).toBe('7d')
    }
  })

  test('rejects wrong type for string param', () => {
    const result = validateSkillParams({ repo: 42 }, SCHEMA)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('string')
    }
  })

  test('rejects wrong type for number param', () => {
    const result = validateSkillParams({ repo: 'a/b', count: 'ten' }, SCHEMA)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('number')
    }
  })

  test('rejects wrong type for boolean param', () => {
    const result = validateSkillParams({ repo: 'a/b', verbose: 'yes' }, SCHEMA)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('boolean')
    }
  })

  test('rejects non-array for string[] param', () => {
    const result = validateSkillParams({ repo: 'a/b', labels: 'bug' }, SCHEMA)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('string array')
    }
  })

  test('rejects array with non-strings for string[] param', () => {
    const result = validateSkillParams({ repo: 'a/b', labels: [1, 2] }, SCHEMA)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('string array')
    }
  })

  test('accepts valid string[] param', () => {
    const result = validateSkillParams({ repo: 'a/b', labels: ['bug', 'feature'] }, SCHEMA)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.labels).toEqual(['bug', 'feature'])
    }
  })

  // Security: shell metacharacter rejection
  test('rejects shell metacharacters in string params', () => {
    const dangerous = [
      'foo; rm -rf /',
      'foo && cat /etc/passwd',
      'foo | grep secret',
      'foo `whoami`',
      'foo $(whoami)',
      'foo {evil}',
    ]
    for (const value of dangerous) {
      const result = validateSkillParams({ repo: value }, SCHEMA)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('invalid characters')
      }
    }
  })

  test('accepts safe special characters in strings', () => {
    // These chars are safe (no shell metacharacters)
    const result = validateSkillParams({ repo: 'owner/repo-name_v2.0' }, SCHEMA)
    expect(result.ok).toBe(true)
  })

  test('handles empty params with no required fields', () => {
    const schema: SkillParam[] = [
      { name: 'opt', type: 'string', required: false, description: 'Optional' },
    ]
    const result = validateSkillParams({}, schema)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({})
    }
  })
})
