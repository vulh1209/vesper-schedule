import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { PATHS, ensureDirectories } from './paths.js'
import { type Result, ok, err } from './types.js'

interface SetupStatus {
  ghAuthenticated: boolean
  directoriesExist: boolean
  firstRun: boolean
}

function checkGhAuth(): boolean {
  try {
    execSync('gh auth status', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/** Check system prerequisites and setup state */
export function checkSetup(): Result<SetupStatus> {
  try {
    const ghAuthenticated = checkGhAuth()
    const directoriesExist = existsSync(PATHS.base)

    return ok({
      ghAuthenticated,
      directoriesExist,
      firstRun: !directoriesExist,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return err(`Setup check failed: ${message}`)
  }
}

/** Run first-time setup: create directories */
export function runFirstTimeSetup(): Result<void> {
  try {
    ensureDirectories()
    return ok(undefined)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return err(`First-time setup failed: ${message}`)
  }
}
