import { Cron } from 'croner'
import type { Schedule } from '../core/schemas.js'
import { writeDaemonLog } from './logger.js'

type ScheduleCallback = (schedule: Schedule) => void

interface ActiveCron {
  schedule: Schedule
  cron: Cron
}

export class SchedulerService {
  private activeCrons = new Map<string, ActiveCron>()
  private callback: ScheduleCallback

  constructor(callback: ScheduleCallback) {
    this.callback = callback
  }

  /** Load schedules and start cron jobs for enabled ones */
  loadSchedules(schedules: Schedule[]): void {
    // Stop any existing crons not in the new list
    for (const [id, active] of this.activeCrons) {
      if (!schedules.find(s => s.id === id)) {
        active.cron.stop()
        this.activeCrons.delete(id)
      }
    }

    for (const schedule of schedules) {
      if (!schedule.enabled) {
        // Stop if currently running
        const existing = this.activeCrons.get(schedule.id)
        if (existing) {
          existing.cron.stop()
          this.activeCrons.delete(schedule.id)
        }
        continue
      }

      // Skip if already active with same cron expression
      const existing = this.activeCrons.get(schedule.id)
      if (existing && existing.schedule.cron === schedule.cron) {
        existing.schedule = schedule // Update params etc.
        continue
      }

      // Stop existing if cron changed
      if (existing) existing.cron.stop()

      // Start new cron
      try {
        const cron = new Cron(schedule.cron, () => {
          writeDaemonLog('info', `Cron triggered for schedule "${schedule.name}"`, { scheduleId: schedule.id })
          this.callback(schedule)
        })

        this.activeCrons.set(schedule.id, { schedule, cron })
        writeDaemonLog('info', `Scheduled "${schedule.name}" with cron "${schedule.cron}"`, { scheduleId: schedule.id })
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        writeDaemonLog('error', `Invalid cron for schedule "${schedule.name}": ${message}`, { scheduleId: schedule.id })
      }
    }
  }

  /** Stop all cron jobs */
  stopAll(): void {
    for (const [, active] of this.activeCrons) {
      active.cron.stop()
    }
    this.activeCrons.clear()
  }

  /** Get number of active schedules */
  activeCount(): number {
    return this.activeCrons.size
  }

  /** Get next run time for a schedule */
  nextRun(scheduleId: string): Date | null {
    const active = this.activeCrons.get(scheduleId)
    if (!active) return null
    return active.cron.nextRun() ?? null
  }
}
