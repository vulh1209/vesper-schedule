import { describe, test, expect, afterEach } from 'bun:test'
import { SchedulerService } from '../../../src/daemon/scheduler.js'
import type { Schedule } from '../../../src/core/schemas.js'

function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 'sched-1',
    name: 'Test schedule',
    cron: '0 9 * * *',
    skill: 'issue-triage',
    params: {},
    enabled: true,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('SchedulerService', () => {
  let scheduler: SchedulerService
  const triggered: Schedule[] = []

  afterEach(() => {
    scheduler?.stopAll()
    triggered.length = 0
  })

  test('creates with callback', () => {
    scheduler = new SchedulerService((s) => { triggered.push(s) })
    expect(scheduler.activeCount()).toBe(0)
  })

  test('loadSchedules activates enabled schedules', () => {
    scheduler = new SchedulerService((s) => { triggered.push(s) })
    scheduler.loadSchedules([makeSchedule()])
    expect(scheduler.activeCount()).toBe(1)
  })

  test('skips disabled schedules', () => {
    scheduler = new SchedulerService((s) => { triggered.push(s) })
    scheduler.loadSchedules([makeSchedule({ enabled: false })])
    expect(scheduler.activeCount()).toBe(0)
  })

  test('stopAll clears all active crons', () => {
    scheduler = new SchedulerService((s) => { triggered.push(s) })
    scheduler.loadSchedules([
      makeSchedule({ id: 'a' }),
      makeSchedule({ id: 'b' }),
    ])
    expect(scheduler.activeCount()).toBe(2)
    scheduler.stopAll()
    expect(scheduler.activeCount()).toBe(0)
  })

  test('nextRun returns a date for active schedule', () => {
    scheduler = new SchedulerService((s) => { triggered.push(s) })
    scheduler.loadSchedules([makeSchedule({ id: 'daily', cron: '0 9 * * *' })])
    const next = scheduler.nextRun('daily')
    expect(next).toBeInstanceOf(Date)
  })

  test('nextRun returns null for unknown schedule', () => {
    scheduler = new SchedulerService((s) => { triggered.push(s) })
    expect(scheduler.nextRun('nonexistent')).toBeNull()
  })

  test('reloading stops removed schedules', () => {
    scheduler = new SchedulerService((s) => { triggered.push(s) })
    scheduler.loadSchedules([
      makeSchedule({ id: 'a' }),
      makeSchedule({ id: 'b' }),
    ])
    expect(scheduler.activeCount()).toBe(2)

    // Reload with only one schedule
    scheduler.loadSchedules([makeSchedule({ id: 'a' })])
    expect(scheduler.activeCount()).toBe(1)
  })

  test('reloading stops disabled schedules', () => {
    scheduler = new SchedulerService((s) => { triggered.push(s) })
    scheduler.loadSchedules([makeSchedule({ id: 'a' })])
    expect(scheduler.activeCount()).toBe(1)

    scheduler.loadSchedules([makeSchedule({ id: 'a', enabled: false })])
    expect(scheduler.activeCount()).toBe(0)
  })

  test('handles invalid cron gracefully', () => {
    scheduler = new SchedulerService((s) => { triggered.push(s) })
    // Invalid cron should not crash, just skip
    scheduler.loadSchedules([makeSchedule({ cron: 'invalid cron' })])
    expect(scheduler.activeCount()).toBe(0)
  })
})
