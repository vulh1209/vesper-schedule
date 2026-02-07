import { query } from '@anthropic-ai/claude-code'
import type { LoadedSkill } from '../skills/loader.js'

// --- Intent types ---

export type ParsedIntent =
  | { type: 'schedule'; skill: string; params: Record<string, unknown>; cron: string; name: string }
  | { type: 'run-now'; skill: string; params: Record<string, unknown> }
  | { type: 'resume'; sessionId: string; message: string }
  | { type: 'command'; command: string; args: string[] }
  | { type: 'unknown'; raw: string }

// --- Regex fast-path for built-in commands (<10ms) ---

const COMMAND_PATTERNS: Array<[RegExp, (match: RegExpMatchArray) => ParsedIntent]> = [
  // Simple commands
  [/^(status|help|quit|exit)$/i, (m) => ({ type: 'command', command: m[1]!.toLowerCase(), args: [] })],
  [/^list$/i, () => ({ type: 'command', command: 'list', args: [] })],

  // Logs with optional job ID
  [/^logs?\s*(.*)$/i, (m) => ({
    type: 'command',
    command: 'logs',
    args: m[1]!.trim() ? [m[1]!.trim()] : [],
  })],

  // Enable/disable schedule
  [/^(enable|disable)\s+(\S+)$/i, (m) => ({
    type: 'command',
    command: m[1]!.toLowerCase(),
    args: [m[2]!],
  })],

  // Delete schedule
  [/^delete\s+(\S+)$/i, (m) => ({
    type: 'command',
    command: 'delete',
    args: [m[1]!],
  })],

  // Daemon management
  [/^daemon\s+(start|stop|status)$/i, (m) => ({
    type: 'command',
    command: 'daemon',
    args: [m[1]!.toLowerCase()],
  })],
]

/**
 * Try to match input against regex patterns for built-in commands.
 * Returns null if no match (falls through to NL parsing).
 */
export function tryCommandFastPath(input: string): ParsedIntent | null {
  const trimmed = input.trim()
  for (const [pattern, handler] of COMMAND_PATTERNS) {
    const match = trimmed.match(pattern)
    if (match) return handler(match)
  }
  return null
}

// --- Claude NL parsing (fallback for natural language) ---

interface ClaudeIntentResponse {
  type: 'schedule' | 'run-now' | 'resume' | 'command' | 'unknown'
  skill?: string
  params?: Record<string, unknown>
  cron?: string
  name?: string
  command?: string
  args?: string[]
  sessionId?: string
  message?: string
}

/**
 * Parse natural language input into structured intent using Claude.
 * Uses structured JSON input (not string interpolation) to prevent injection.
 */
async function parseWithClaude(
  input: string,
  skills: LoadedSkill[],
): Promise<ParsedIntent> {
  const skillDescriptions = skills.map(s => ({
    slug: s.slug,
    description: s.metadata.description,
    params: s.metadata.params.map(p => ({
      name: p.name,
      type: p.type,
      required: p.required,
      description: p.description,
    })),
  }))

  const structuredInput = JSON.stringify({
    task: 'parse_intent',
    user_input: input,
    available_skills: skillDescriptions,
    available_commands: ['status', 'list', 'logs', 'enable', 'disable', 'delete', 'daemon', 'help', 'quit'],
  })

  const systemPrompt = `You are a parser that converts natural language to structured intents. Support both Vietnamese and English input.

Parse the user_input field from the JSON input and respond with valid JSON only.

Response format:
{
  "type": "schedule" | "run-now" | "resume" | "command" | "unknown",
  "skill": "skill-slug (if type is schedule or run-now)",
  "params": { "param_name": "value" },
  "cron": "cron expression (if type is schedule)",
  "name": "human-readable name (if type is schedule)",
  "command": "command name (if type is command)",
  "args": ["arg1"] ,
  "sessionId": "session id (if type is resume)",
  "message": "follow-up message (if type is resume)"
}

Time expression examples:
- "moi sang 9h" / "every morning at 9" → cron "0 9 * * *"
- "thu 2 den thu 6 luc 8h30" / "weekdays at 8:30" → cron "30 8 * * 1-5"
- "moi 2 tieng" / "every 2 hours" → cron "0 */2 * * *"
- "hang tuan thu 2" / "every Monday" → cron "0 9 * * 1"

Respond with JSON only, no markdown formatting.`

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

    // Clean up potential markdown wrapping
    resultText = resultText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim()

    const parsed: ClaudeIntentResponse = JSON.parse(resultText)
    return normalizeIntent(parsed, input)
  } catch {
    return { type: 'unknown', raw: input }
  }
}

/** Normalize Claude's response into a well-typed ParsedIntent */
function normalizeIntent(raw: ClaudeIntentResponse, originalInput: string): ParsedIntent {
  switch (raw.type) {
    case 'schedule':
      if (!raw.skill || !raw.cron) return { type: 'unknown', raw: originalInput }
      return {
        type: 'schedule',
        skill: raw.skill,
        params: raw.params ?? {},
        cron: raw.cron,
        name: raw.name ?? `${raw.skill} schedule`,
      }
    case 'run-now':
      if (!raw.skill) return { type: 'unknown', raw: originalInput }
      return {
        type: 'run-now',
        skill: raw.skill,
        params: raw.params ?? {},
      }
    case 'resume':
      return {
        type: 'resume',
        sessionId: raw.sessionId ?? '',
        message: raw.message ?? originalInput,
      }
    case 'command':
      return {
        type: 'command',
        command: raw.command ?? '',
        args: raw.args ?? [],
      }
    default:
      return { type: 'unknown', raw: originalInput }
  }
}

/**
 * Parse user input into a structured intent.
 * Fast-path: regex for built-in commands (<10ms).
 * Slow-path: Claude NL parsing for natural language (~3-5s).
 */
export async function parseIntent(
  input: string,
  skills: LoadedSkill[],
): Promise<ParsedIntent> {
  // 1. Try regex fast-path first
  const fastResult = tryCommandFastPath(input)
  if (fastResult) return fastResult

  // 2. Fall back to Claude for natural language
  return parseWithClaude(input, skills)
}
