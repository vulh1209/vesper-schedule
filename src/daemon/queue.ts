import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { PATHS } from '../core/paths.js'
import { type JobId, jobId } from '../core/types.js'
import type { WorkerResult } from '../core/types.js'
import { executeSkill } from '../worker/executor.js'
import { writeJobLog } from './logger.js'

export interface QueuedJob {
  id: JobId
  scheduleId: string
  skill: string
  params: Record<string, unknown>
  createdAt: string
  status: 'pending' | 'running' | 'completed' | 'failed'
}

export type QueueEventType = 'job:start' | 'job:complete' | 'job:fail' | 'circuit:open' | 'circuit:close'
export type QueueListener = (event: QueueEventType, job: QueuedJob, result?: WorkerResult) => void

/** Generate a short random job ID */
export function generateJobId(): JobId {
  return jobId(Math.random().toString(36).slice(2, 10))
}

export class JobQueue {
  private queue: QueuedJob[] = []
  private isExecuting = false
  private isRunning = false
  private maxQueueSize: number
  private jobTimeoutMs: number
  private listeners: QueueListener[] = []

  // Circuit breaker
  private consecutiveFailures = 0
  private readonly MAX_FAILURES = 3
  private readonly COOLDOWN_MS = 5 * 60 * 1000 // 5 min
  private cooldownUntil: number | null = null

  constructor(maxQueueSize = 50, jobTimeoutMs = 600_000) {
    this.maxQueueSize = maxQueueSize
    this.jobTimeoutMs = jobTimeoutMs
    this.loadPendingQueue()
  }

  on(listener: QueueListener): void {
    this.listeners.push(listener)
  }

  private emit(event: QueueEventType, job: QueuedJob, result?: WorkerResult): void {
    for (const listener of this.listeners) {
      listener(event, job, result)
    }
  }

  /** Enqueue a job. Returns false if queue is full. */
  enqueue(job: QueuedJob): boolean {
    if (this.queue.length >= this.maxQueueSize) return false
    this.queue.push(job)
    writeJobLog(job.id, 'info', 'Job enqueued', { skill: job.skill, params: job.params })
    this.processNext()
    return true
  }

  /** Start processing the queue */
  start(): void {
    this.isRunning = true
    this.processNext()
  }

  /** Stop accepting new jobs; current job will finish */
  stop(): void {
    this.isRunning = false
  }

  /** Get current queue state */
  getStatus(): { pending: number; isExecuting: boolean; circuitOpen: boolean; cooldownUntil: number | null } {
    return {
      pending: this.queue.filter(j => j.status === 'pending').length,
      isExecuting: this.isExecuting,
      circuitOpen: this.cooldownUntil !== null && Date.now() < this.cooldownUntil,
      cooldownUntil: this.cooldownUntil,
    }
  }

  /** Get all jobs in queue */
  getJobs(): QueuedJob[] {
    return [...this.queue]
  }

  /** Save pending jobs to disk for restart recovery */
  persistPendingQueue(): void {
    const pending = this.queue.filter(j => j.status === 'pending')
    try {
      writeFileSync(PATHS.daemon.queuePending, JSON.stringify(pending, null, 2))
    } catch {
      // Best effort
    }
  }

  /** Load pending jobs from disk (called on daemon restart) */
  private loadPendingQueue(): void {
    if (!existsSync(PATHS.daemon.queuePending)) return
    try {
      const raw = readFileSync(PATHS.daemon.queuePending, 'utf-8')
      const jobs = JSON.parse(raw) as QueuedJob[]
      for (const job of jobs) {
        if (job.status === 'pending') {
          this.queue.push(job)
        }
      }
    } catch {
      // Ignore corrupt queue file
    }
  }

  private async processNext(): Promise<void> {
    if (!this.isRunning || this.isExecuting) return

    // Circuit breaker check
    if (this.cooldownUntil && Date.now() < this.cooldownUntil) return

    // Clear expired cooldown
    if (this.cooldownUntil && Date.now() >= this.cooldownUntil) {
      this.cooldownUntil = null
      this.consecutiveFailures = 0
    }

    const nextJob = this.queue.find(j => j.status === 'pending')
    if (!nextJob) return

    this.isExecuting = true
    nextJob.status = 'running'
    this.emit('job:start', nextJob)
    writeJobLog(nextJob.id, 'info', 'Job started')

    try {
      const result = await executeSkill({
        skillSlug: nextJob.skill,
        params: nextJob.params,
        timeoutMs: this.jobTimeoutMs,
      })

      if (result.ok) {
        nextJob.status = 'completed'
        this.consecutiveFailures = 0
        this.emit('job:complete', nextJob, result)
        writeJobLog(nextJob.id, 'info', 'Job completed', {
          cost: result.cost,
          duration: result.duration,
          sessionId: result.sessionId,
        })
      } else {
        nextJob.status = 'failed'
        this.consecutiveFailures++
        this.emit('job:fail', nextJob, result)
        writeJobLog(nextJob.id, 'error', `Job failed: ${result.error}`, { code: result.code })

        if (this.consecutiveFailures >= this.MAX_FAILURES) {
          this.cooldownUntil = Date.now() + this.COOLDOWN_MS
          const dummyJob: QueuedJob = { ...nextJob }
          this.emit('circuit:open', dummyJob)
          writeJobLog(nextJob.id, 'warn', `Circuit breaker open: ${this.consecutiveFailures} consecutive failures, cooldown ${this.COOLDOWN_MS}ms`)
        }
      }
    } catch (e) {
      nextJob.status = 'failed'
      this.consecutiveFailures++
      const message = e instanceof Error ? e.message : String(e)
      writeJobLog(nextJob.id, 'error', `Job exception: ${message}`)
    } finally {
      this.isExecuting = false
      // Remove completed/failed jobs from queue (keep for status queries briefly)
      this.queue = this.queue.filter(j => j.status === 'pending')
      this.processNext()
    }
  }
}
