import { appendFileSync, readdirSync, statSync, existsSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { PATHS, logDirForDate } from '../core/paths.js'

const MAX_LOG_SIZE = 1_000_000 // 1MB per log file
const MAX_LOG_AGE_DAYS = 30

interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  jobId?: string
  message: string
  data?: unknown
}

/** Write a structured log entry for a job */
export function writeJobLog(jobId: string, level: LogEntry['level'], message: string, data?: unknown): void {
  const now = new Date()
  const dir = logDirForDate(now)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const filePath = join(dir, `${jobId}.log`)
  const entry: LogEntry = {
    timestamp: now.toISOString(),
    level,
    jobId,
    message,
    data,
  }

  // Cap at 1MB — skip if file already at limit
  if (existsSync(filePath)) {
    try {
      const stat = statSync(filePath)
      if (stat.size >= MAX_LOG_SIZE) return
    } catch {
      // stat failed, try writing anyway
    }
  }

  const line = JSON.stringify(entry) + '\n'
  appendFileSync(filePath, line)
}

/** Write daemon-level log (not job-specific) */
export function writeDaemonLog(level: LogEntry['level'], message: string, data?: unknown): void {
  const now = new Date()
  const dir = logDirForDate(now)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const filePath = join(dir, 'daemon.log')
  const entry: LogEntry = {
    timestamp: now.toISOString(),
    level,
    message,
    data,
  }

  if (existsSync(filePath)) {
    try {
      const stat = statSync(filePath)
      if (stat.size >= MAX_LOG_SIZE) return
    } catch {
      // continue
    }
  }

  appendFileSync(filePath, JSON.stringify(entry) + '\n')
}

/** Remove log directories older than MAX_LOG_AGE_DAYS */
export function cleanupOldLogs(): number {
  if (!existsSync(PATHS.logs)) return 0

  const cutoff = Date.now() - MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000
  let removed = 0

  try {
    const dirs = readdirSync(PATHS.logs)
    for (const dir of dirs) {
      // Dir names are ISO dates like "2026-02-07"
      const dirDate = new Date(dir).getTime()
      if (isNaN(dirDate) || dirDate >= cutoff) continue

      const dirPath = join(PATHS.logs, dir)
      try {
        rmSync(dirPath, { recursive: true })
        removed++
      } catch {
        // Skip if can't remove
      }
    }
  } catch {
    // Skip if can't read logs dir
  }

  return removed
}

/** Initialize logging: ensure dirs exist, clean old logs */
export function initLogging(): void {
  cleanupOldLogs()
}
