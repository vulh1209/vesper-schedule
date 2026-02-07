import type { SkillParam } from '../core/schemas.js'
import { type Result, ok, err } from '../core/types.js'

/** Validate params against a skill's parameter schema */
export function validateSkillParams(
  params: Record<string, unknown>,
  schema: SkillParam[],
): Result<Record<string, unknown>> {
  const validated: Record<string, unknown> = {}

  for (const param of schema) {
    const value = params[param.name]

    // Check required params
    if (value === undefined || value === null) {
      if (param.required) {
        return err(`Missing required parameter: "${param.name}"`)
      }
      if (param.default !== undefined) {
        validated[param.name] = param.default
      }
      continue
    }

    // Type check
    switch (param.type) {
      case 'string':
        if (typeof value !== 'string') {
          return err(`Parameter "${param.name}" must be a string, got ${typeof value}`)
        }
        // Reject shell metacharacters for security
        if (/[;&|`$(){}]/.test(value)) {
          return err(`Parameter "${param.name}" contains invalid characters`)
        }
        break
      case 'number':
        if (typeof value !== 'number') {
          return err(`Parameter "${param.name}" must be a number, got ${typeof value}`)
        }
        break
      case 'boolean':
        if (typeof value !== 'boolean') {
          return err(`Parameter "${param.name}" must be a boolean, got ${typeof value}`)
        }
        break
      case 'string[]':
        if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) {
          return err(`Parameter "${param.name}" must be a string array`)
        }
        break
    }

    validated[param.name] = value
  }

  return ok(validated)
}
