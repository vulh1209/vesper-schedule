import { describe, test, expect } from 'bun:test'
import { validateCron, getNextRuns } from '../../../src/parser/cron-parser.js'

describe('validateCron', () => {
  test('valid standard cron expression', () => {
    expect(validateCron('0 9 * * 1-5')).not.toBeNull()
  })

  test('valid every minute expression', () => {
    expect(validateCron('* * * * *')).not.toBeNull()
  })

  test('valid step expression', () => {
    expect(validateCron('*/30 * * * *')).not.toBeNull()
  })

  test('valid complex expression', () => {
    expect(validateCron('30 8 * * 1-5')).not.toBeNull()
  })

  test('invalid cron expression returns null', () => {
    expect(validateCron('not a cron')).toBeNull()
  })

  test('empty string returns null', () => {
    expect(validateCron('')).toBeNull()
  })

  test('too many fields returns null', () => {
    expect(validateCron('* * * * * * *')).toBeNull()
  })
})

describe('getNextRuns', () => {
  test('returns expected number of runs', () => {
    const runs = getNextRuns('* * * * *', 3) // Every minute
    expect(runs).toHaveLength(3)
  })

  test('runs are valid ISO dates', () => {
    const runs = getNextRuns('0 9 * * *', 3)
    for (const run of runs) {
      const date = new Date(run)
      expect(date.getTime()).not.toBeNaN()
    }
  })

  test('runs are in chronological order', () => {
    const runs = getNextRuns('0 * * * *', 3)
    for (let i = 1; i < runs.length; i++) {
      expect(new Date(runs[i]!).getTime()).toBeGreaterThan(new Date(runs[i - 1]!).getTime())
    }
  })

  test('returns empty array for invalid expression', () => {
    const runs = getNextRuns('not valid', 3)
    expect(runs).toEqual([])
  })

  test('returns 0 items when count is 0', () => {
    const runs = getNextRuns('* * * * *', 0)
    expect(runs).toHaveLength(0)
  })
})
