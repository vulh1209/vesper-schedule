import { readFileSync, existsSync } from 'node:fs'
import { PATHS, repoConfigPath } from './paths.js'
import { ConfigSchema, type Config } from './schemas.js'
import { type Result, ok, err } from './types.js'

function readJsonSafe(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {}
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    const sourceVal = source[key]
    const targetVal = result[key]
    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      )
    } else {
      result[key] = sourceVal
    }
  }
  return result
}

/** Load config with merge: defaults → global → repo-local */
export function loadConfig(repoPath?: string): Result<Config> {
  try {
    const globalConfig = readJsonSafe(PATHS.config)
    const localConfig = repoPath ? readJsonSafe(repoConfigPath(repoPath)) : {}
    const merged = deepMerge(globalConfig, localConfig)
    const config = ConfigSchema.parse(merged)
    return ok(config)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return err(`Failed to load config: ${message}`)
  }
}
