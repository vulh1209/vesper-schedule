import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdirSync, existsSync } from 'node:fs'

const HOME_DIR = homedir()
const BASE_DIR = join(HOME_DIR, '.vesper-schedule')

export const PATHS = {
  base: BASE_DIR,
  config: join(BASE_DIR, 'config.json'),
  schedules: join(BASE_DIR, 'schedules'),
  logs: join(BASE_DIR, 'logs'),
  sessions: join(BASE_DIR, 'sessions'),
  skills: join(BASE_DIR, 'skills'),
  daemon: {
    pid: join(BASE_DIR, 'daemon.pid'),
    socket: join(BASE_DIR, 'daemon.sock'),
    queuePending: join(BASE_DIR, 'queue-pending.json'),
  },
} as const

/** Per-repo config path */
export function repoConfigPath(repoRoot: string): string {
  return join(repoRoot, '.vesper-schedule', 'config.json')
}

/** Per-repo skills path */
export function repoSkillsPath(repoRoot: string): string {
  return join(repoRoot, '.vesper-schedule', 'skills')
}

/** Log directory for a specific date */
export function logDirForDate(date: Date): string {
  const iso = date.toISOString().split('T')[0]!
  return join(PATHS.logs, iso)
}

/** Ensure all base directories exist */
export function ensureDirectories(): void {
  const dirs = [
    PATHS.base,
    PATHS.schedules,
    PATHS.logs,
    PATHS.sessions,
    PATHS.skills,
  ]
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
  }
}
