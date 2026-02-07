import { query } from '@anthropic-ai/claude-code'
import { Cron } from 'croner'

export interface CronParseResult {
  expression: string
  description: string
  nextRuns: string[]  // ISO date strings of next 3 runs
}

/**
 * Parse a natural language time expression into a cron expression using Claude.
 * Validates the result with croner before returning.
 * Returns null if parsing fails.
 */
export async function parseCronExpression(
  input: string,
): Promise<CronParseResult | null> {
  const structuredInput = JSON.stringify({
    task: 'parse_cron',
    time_expression: input,
  })

  const systemPrompt = `Convert the time_expression from the JSON input into a standard cron expression (5 fields: minute hour day month weekday).

Support both Vietnamese and English input.

Examples:
- "moi sang 9h" / "every morning 9am" → "0 9 * * *"
- "thu 2 den thu 6 luc 8h30" / "weekdays 8:30am" → "30 8 * * 1-5"
- "moi 2 tieng" / "every 2 hours" → "0 */2 * * *"
- "hang tuan thu 2" / "every Monday" → "0 9 * * 1"
- "moi 30 phut" / "every 30 minutes" → "*/30 * * * *"
- "12h trua moi ngay" / "noon every day" → "0 12 * * *"
- "6h chieu thu 6" / "Friday 6pm" → "0 18 * * 5"

Respond with JSON only:
{ "expression": "cron expression", "description": "human-readable description in English" }`

  try {
    const conversation = query({
      prompt: structuredInput,
      options: {
        customSystemPrompt: systemPrompt,
        maxTurns: 1,
      },
    })

    let resultText = ''
    for await (const message of conversation) {
      if (message.type === 'result' && message.subtype === 'success') {
        resultText = message.result
      }
    }

    // Clean up markdown wrapping
    resultText = resultText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()

    const parsed = JSON.parse(resultText) as { expression: string; description: string }

    // Validate with croner
    const cron = validateCron(parsed.expression)
    if (!cron) return null

    // Get next 3 execution times
    const nextRuns = getNextRuns(parsed.expression, 3)

    return {
      expression: parsed.expression,
      description: parsed.description,
      nextRuns,
    }
  } catch {
    return null
  }
}

/**
 * Validate a cron expression using croner.
 * Returns the Cron instance if valid, null otherwise.
 */
export function validateCron(expression: string): Cron | null {
  try {
    return new Cron(expression)
  } catch {
    return null
  }
}

/**
 * Get the next N execution times for a cron expression.
 * Returns ISO date strings.
 */
export function getNextRuns(expression: string, count: number): string[] {
  try {
    const cron = new Cron(expression)
    const runs: string[] = []
    let next = cron.nextRun()
    for (let i = 0; i < count && next; i++) {
      runs.push(next.toISOString())
      next = cron.nextRun(new Date(next.getTime() + 1000))
    }
    return runs
  } catch {
    return []
  }
}
