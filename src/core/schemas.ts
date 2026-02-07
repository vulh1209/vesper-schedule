import { z } from 'zod'

// --- Skill schemas ---

export const SkillParamSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'string[]']),
  required: z.boolean().default(false),
  default: z.unknown().optional(),
  description: z.string(),
})

export const SkillFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string().default('1.0.0'),
  params: z.array(SkillParamSchema).default([]),
  allowedTools: z.array(z.string()).default(['Bash(gh *)', 'Read']),
  output: z.object({
    target: z.enum([
      'github-issue-comment',
      'github-pr-review',
      'github-release',
      'github-issue-create',
      'github-label',
    ]),
  }),
})

export type SkillParam = z.infer<typeof SkillParamSchema>
export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>

// --- Config schemas ---

export const DaemonConfigSchema = z.object({
  log_level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  max_queue_size: z.number().default(50),
  job_timeout_ms: z.number().default(600_000), // 10 min
  socket_path: z.string().optional(),
}).default({})

export const ReplConfigSchema = z.object({
  language: z.enum(['vi', 'en']).default('en'),
}).default({})

export const ConfigSchema = z.object({
  default_repo: z.string().optional(),
  daemon: DaemonConfigSchema,
  repl: ReplConfigSchema,
})

export type Config = z.infer<typeof ConfigSchema>

// --- Schedule schemas ---

export const ScheduleSchema = z.object({
  id: z.string(),
  name: z.string(),
  cron: z.string(),
  skill: z.string(),
  params: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true),
  created_at: z.string().datetime(),
  last_run: z.string().datetime().optional(),
  last_session_id: z.string().optional(),
  last_status: z.enum(['completed', 'failed']).optional(),
})

export type Schedule = z.infer<typeof ScheduleSchema>

// --- IPC message schemas ---

export const IpcMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('schedule:create'), version: z.number().default(1), id: z.string(), payload: ScheduleSchema }),
  z.object({ type: z.literal('schedule:update'), version: z.number().default(1), id: z.string(), payload: z.object({ id: z.string(), changes: ScheduleSchema.partial() }) }),
  z.object({ type: z.literal('schedule:delete'), version: z.number().default(1), id: z.string(), payload: z.object({ id: z.string() }) }),
  z.object({ type: z.literal('schedule:list'), version: z.number().default(1), id: z.string(), payload: z.object({}) }),
  z.object({ type: z.literal('schedule:enable'), version: z.number().default(1), id: z.string(), payload: z.object({ id: z.string(), enabled: z.boolean() }) }),
  z.object({ type: z.literal('job:run-now'), version: z.number().default(1), id: z.string(), payload: z.object({ skill: z.string(), params: z.record(z.unknown()).default({}) }) }),
  z.object({ type: z.literal('job:status'), version: z.number().default(1), id: z.string(), payload: z.object({}) }),
  z.object({ type: z.literal('daemon:status'), version: z.number().default(1), id: z.string(), payload: z.object({}) }),
  z.object({ type: z.literal('daemon:shutdown'), version: z.number().default(1), id: z.string(), payload: z.object({}) }),
])

export type IpcMessage = z.infer<typeof IpcMessageSchema>
