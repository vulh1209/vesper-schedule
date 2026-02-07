import { writeFileSync, readFileSync, existsSync, unlinkSync, renameSync } from 'node:fs'
import { PATHS, ensureDirectories } from '../core/paths.js'
import { loadConfig } from '../core/config.js'
import { loadSchedules } from './schedules.js'
import { JobQueue, generateJobId, type QueuedJob } from './queue.js'
import { SchedulerService } from './scheduler.js'
import { IpcServer } from '../ipc/server.js'
import { initLogging, writeDaemonLog } from './logger.js'
import type { IpcRequest, IpcResponse } from '../ipc/protocol.js'
import { type ScheduleId, scheduleId } from '../core/types.js'

// --- PID file management ---

function writePidFile(): void {
  const tmpPath = `${PATHS.daemon.pid}.tmp.${process.pid}`
  writeFileSync(tmpPath, String(process.pid))
  renameSync(tmpPath, PATHS.daemon.pid) // Atomic
}

function removePidFile(): void {
  try {
    if (existsSync(PATHS.daemon.pid)) unlinkSync(PATHS.daemon.pid)
  } catch {
    // Best effort
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function checkExistingDaemon(): boolean {
  if (!existsSync(PATHS.daemon.pid)) return false
  try {
    const pid = Number(readFileSync(PATHS.daemon.pid, 'utf-8').trim())
    if (isNaN(pid)) {
      unlinkSync(PATHS.daemon.pid)
      return false
    }
    if (isProcessAlive(pid)) return true
    // Stale PID — process is dead
    unlinkSync(PATHS.daemon.pid)
    writeDaemonLog('info', `Cleaned up stale PID file (pid: ${pid})`)
    return false
  } catch {
    return false
  }
}

// --- IPC message handler ---

function createIpcHandler(
  queue: JobQueue,
  scheduler: SchedulerService,
): (request: IpcRequest) => Promise<IpcResponse> {
  return async (request: IpcRequest): Promise<IpcResponse> => {
    const { id, type, payload } = request

    switch (type) {
      case 'daemon:status': {
        const queueStatus = queue.getStatus()
        return {
          id,
          success: true,
          data: {
            running: true,
            pid: process.pid,
            activeSchedules: scheduler.activeCount(),
            queuePending: queueStatus.pending,
            queueExecuting: queueStatus.isExecuting,
            circuitOpen: queueStatus.circuitOpen,
          },
        }
      }

      case 'daemon:shutdown': {
        writeDaemonLog('info', 'Shutdown requested via IPC')
        // Trigger graceful shutdown asynchronously
        setTimeout(() => process.kill(process.pid, 'SIGTERM'), 100)
        return { id, success: true, data: { message: 'Shutdown initiated' } }
      }

      case 'job:run-now': {
        const { skill, params } = payload as { skill: string; params: Record<string, unknown> }
        const job: QueuedJob = {
          id: generateJobId(),
          scheduleId: '',
          skill,
          params: params ?? {},
          createdAt: new Date().toISOString(),
          status: 'pending',
        }
        const enqueued = queue.enqueue(job)
        if (!enqueued) {
          return { id, success: false, error: 'Queue is full' }
        }
        return { id, success: true, data: { jobId: job.id } }
      }

      case 'job:status': {
        return { id, success: true, data: { jobs: queue.getJobs(), ...queue.getStatus() } }
      }

      case 'schedule:list': {
        const result = loadSchedules()
        if (!result.ok) return { id, success: false, error: result.error }
        return { id, success: true, data: result.value }
      }

      case 'schedule:create': {
        const { saveSchedule } = await import('./schedules.js')
        const schedule = payload as Record<string, unknown>
        const newSchedule = {
          ...schedule,
          id: schedule['id'] as string ?? scheduleId(Math.random().toString(36).slice(2, 10)) as string,
          created_at: schedule['created_at'] as string ?? new Date().toISOString(),
          enabled: schedule['enabled'] as boolean ?? true,
        }
        // Re-parse through schema for validation
        const { ScheduleSchema } = await import('../core/schemas.js')
        try {
          const validated = ScheduleSchema.parse(newSchedule)
          const saveResult = saveSchedule(validated)
          if (!saveResult.ok) return { id, success: false, error: saveResult.error }
          // Reload schedules
          reloadSchedules(scheduler)
          return { id, success: true, data: validated }
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          return { id, success: false, error: `Invalid schedule: ${message}` }
        }
      }

      case 'schedule:delete': {
        const { deleteSchedule } = await import('./schedules.js')
        const deleteId = (payload as { id: string }).id
        const result = deleteSchedule(deleteId)
        if (!result.ok) return { id, success: false, error: result.error }
        reloadSchedules(scheduler)
        return { id, success: true, data: { deleted: deleteId } }
      }

      case 'schedule:enable': {
        const { setScheduleEnabled } = await import('./schedules.js')
        const { id: enableId, enabled } = payload as { id: string; enabled: boolean }
        const result = setScheduleEnabled(enableId, enabled)
        if (!result.ok) return { id, success: false, error: result.error }
        reloadSchedules(scheduler)
        return { id, success: true, data: result.value }
      }

      default:
        return { id, success: false, error: `Unknown message type: ${type}` }
    }
  }
}

function reloadSchedules(scheduler: SchedulerService): void {
  const result = loadSchedules()
  if (result.ok) {
    scheduler.loadSchedules(result.value)
  }
}

// --- Daemon lifecycle ---

// Keep references for shutdown
let _queue: JobQueue | null = null
let _scheduler: SchedulerService | null = null
let _ipcServer: IpcServer | null = null
let _shutdownInProgress = false

async function shutdown(): Promise<void> {
  if (_shutdownInProgress) return
  _shutdownInProgress = true
  writeDaemonLog('info', 'Daemon shutting down...')

  // 1. Stop scheduler (no new jobs)
  _scheduler?.stopAll()

  // 2. Stop queue (finish current job)
  _queue?.stop()
  _queue?.persistPendingQueue()

  // 3. Close IPC
  if (_ipcServer) await _ipcServer.close()

  // 4. Remove PID file
  removePidFile()

  writeDaemonLog('info', 'Daemon stopped')
  process.exit(0)
}

export async function startDaemon(): Promise<void> {
  ensureDirectories()
  initLogging()

  // Check for existing daemon
  if (checkExistingDaemon()) {
    console.error('Daemon is already running.')
    process.exit(1)
  }

  // Write PID (atomic)
  writePidFile()

  // Load config
  const configResult = loadConfig()
  const config = configResult.ok ? configResult.value : undefined

  // Create queue
  _queue = new JobQueue(
    config?.daemon.max_queue_size ?? 50,
    config?.daemon.job_timeout_ms ?? 600_000,
  )

  // Create scheduler
  _scheduler = new SchedulerService((schedule) => {
    const _sid: ScheduleId = scheduleId(schedule.id)
    const job: QueuedJob = {
      id: generateJobId(),
      scheduleId: _sid,
      skill: schedule.skill,
      params: schedule.params,
      createdAt: new Date().toISOString(),
      status: 'pending',
    }
    _queue!.enqueue(job)
  })

  // Load and start schedules
  const schedulesResult = loadSchedules()
  if (schedulesResult.ok) {
    _scheduler.loadSchedules(schedulesResult.value)
  }

  // Start queue
  _queue.start()

  // Start IPC server (last — so daemon is fully ready before accepting connections)
  _ipcServer = new IpcServer(createIpcHandler(_queue, _scheduler), config?.daemon.socket_path)
  await _ipcServer.listen()

  // Graceful shutdown
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  writeDaemonLog('info', `Daemon started (pid: ${process.pid})`)
  console.log(`Daemon started (pid: ${process.pid})`)
}

/** Stop the daemon by reading PID and sending SIGTERM */
export function stopDaemon(): boolean {
  if (!existsSync(PATHS.daemon.pid)) {
    console.log('Daemon is not running (no PID file).')
    return false
  }

  try {
    const pid = Number(readFileSync(PATHS.daemon.pid, 'utf-8').trim())
    if (isNaN(pid) || !isProcessAlive(pid)) {
      removePidFile()
      console.log('Daemon was not running (stale PID). Cleaned up.')
      return false
    }
    process.kill(pid, 'SIGTERM')
    console.log(`Sent SIGTERM to daemon (pid: ${pid}).`)
    return true
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error(`Failed to stop daemon: ${message}`)
    return false
  }
}

/** Get daemon status */
export function getDaemonStatus(): { running: boolean; pid?: number } {
  if (!existsSync(PATHS.daemon.pid)) return { running: false }
  try {
    const pid = Number(readFileSync(PATHS.daemon.pid, 'utf-8').trim())
    if (isNaN(pid) || !isProcessAlive(pid)) {
      removePidFile()
      return { running: false }
    }
    return { running: true, pid }
  } catch {
    return { running: false }
  }
}
