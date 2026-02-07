import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { PATHS, ensureDirectories } from '../core/paths.js'
import { ScheduleSchema, type Schedule } from '../core/schemas.js'
import { type Result, ok, err, type ScheduleId, scheduleId } from '../core/types.js'

function schedulePath(id: string): string {
  return join(PATHS.schedules, `${id}.json`)
}

/** Generate a short random schedule ID */
export function generateScheduleId(): ScheduleId {
  const raw = Math.random().toString(36).slice(2, 10)
  return scheduleId(raw)
}

/** Load all schedules from disk */
export function loadSchedules(): Result<Schedule[]> {
  ensureDirectories()
  try {
    if (!existsSync(PATHS.schedules)) return ok([])
    const files = readdirSync(PATHS.schedules).filter(f => f.endsWith('.json'))
    const schedules: Schedule[] = []

    for (const file of files) {
      const filePath = join(PATHS.schedules, file)
      try {
        const raw = readFileSync(filePath, 'utf-8')
        const parsed = ScheduleSchema.parse(JSON.parse(raw))
        schedules.push(parsed)
      } catch {
        // Skip invalid schedule files
      }
    }

    return ok(schedules)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return err(`Failed to load schedules: ${message}`)
  }
}

/** Load a single schedule by ID */
export function loadSchedule(id: string): Result<Schedule> {
  const filePath = schedulePath(id)
  if (!existsSync(filePath)) return err(`Schedule not found: "${id}"`)
  try {
    const raw = readFileSync(filePath, 'utf-8')
    return ok(ScheduleSchema.parse(JSON.parse(raw)))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return err(`Invalid schedule "${id}": ${message}`)
  }
}

/** Save a schedule to disk */
export function saveSchedule(schedule: Schedule): Result<void> {
  ensureDirectories()
  try {
    const validated = ScheduleSchema.parse(schedule)
    writeFileSync(schedulePath(validated.id), JSON.stringify(validated, null, 2))
    return ok(undefined)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return err(`Failed to save schedule: ${message}`)
  }
}

/** Delete a schedule from disk */
export function deleteSchedule(id: string): Result<void> {
  const filePath = schedulePath(id)
  if (!existsSync(filePath)) return err(`Schedule not found: "${id}"`)
  try {
    unlinkSync(filePath)
    return ok(undefined)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return err(`Failed to delete schedule: ${message}`)
  }
}

/** Update a schedule's enabled state */
export function setScheduleEnabled(id: string, enabled: boolean): Result<Schedule> {
  const result = loadSchedule(id)
  if (!result.ok) return result
  const updated = { ...result.value, enabled }
  const saveResult = saveSchedule(updated)
  if (!saveResult.ok) return err(saveResult.error)
  return ok(updated)
}
