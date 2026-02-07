import { Command } from 'commander'
import { loadAllSkills, loadSkill } from '../skills/loader.js'
import { executeSkill } from '../worker/executor.js'
import { startDaemon, stopDaemon, getDaemonStatus } from '../daemon/index.js'
import { loadSchedules, saveSchedule, generateScheduleId } from '../daemon/schedules.js'
import { sendIpcRequest } from '../ipc/client.js'
import { checkSetup, runFirstTimeSetup } from '../core/setup.js'
import { ensureDirectories } from '../core/paths.js'
import { validateCron, getNextRuns } from '../parser/cron-parser.js'
import { startRepl } from './repl.js'

const program = new Command()

program
  .name('vesper-schedule')
  .description('CLI tool for scheduling and executing GitHub automation with Claude Code SDK')
  .version('0.1.0')

// --- Default action: REPL ---
program
  .action(() => {
    const setup = checkSetup()
    if (!setup.ok) {
      console.error(`Setup check failed: ${setup.error}`)
      process.exit(1)
    }
    if (setup.value.firstRun) {
      console.log('First run detected. Setting up ~/.vesper-schedule/ ...')
      const setupResult = runFirstTimeSetup()
      if (!setupResult.ok) {
        console.error(setupResult.error)
        process.exit(1)
      }
      console.log('Setup complete.')
    }
    if (!setup.value.ghAuthenticated) {
      console.warn('Warning: gh CLI not authenticated. Run `gh auth login` first.')
    }
    startRepl()
  })

// --- skills subcommand ---
const skillsCmd = new Command('skills')
  .description('Manage skills')

skillsCmd
  .command('list')
  .description('List all available skills')
  .option('--json', 'Output as JSON')
  .action((opts: { json?: boolean }) => {
    ensureDirectories()
    const result = loadAllSkills()
    if (!result.ok) {
      console.error(result.error)
      process.exit(1)
    }
    const skills = result.value

    if (opts.json) {
      console.log(JSON.stringify(skills.map(s => ({
        slug: s.slug,
        name: s.metadata.name,
        description: s.metadata.description,
        version: s.metadata.version,
        source: s.source,
        params: s.metadata.params.map(p => p.name),
      })), null, 2))
      return
    }

    if (skills.length === 0) {
      console.log('No skills found.')
      return
    }

    console.log(`\n  Skills (${skills.length}):\n`)
    for (const skill of skills) {
      const params = skill.metadata.params.map(p =>
        p.required ? p.name : `${p.name}?`
      ).join(', ')
      console.log(`  ${skill.slug.padEnd(20)} ${skill.metadata.description}`)
      if (params) {
        console.log(`  ${''.padEnd(20)} params: ${params}`)
      }
      console.log(`  ${''.padEnd(20)} source: ${skill.source}  v${skill.metadata.version}`)
      console.log()
    }
  })

skillsCmd
  .command('show <name>')
  .description('Show details of a specific skill')
  .option('--json', 'Output as JSON')
  .action((name: string, opts: { json?: boolean }) => {
    ensureDirectories()
    const result = loadSkill(name)
    if (!result.ok) {
      console.error(result.error)
      process.exit(1)
    }
    const skill = result.value

    if (opts.json) {
      console.log(JSON.stringify({
        slug: skill.slug,
        metadata: skill.metadata,
        content: skill.content,
        path: skill.path,
        source: skill.source,
      }, null, 2))
      return
    }

    console.log(`\n  Skill: ${skill.metadata.name}`)
    console.log(`  Description: ${skill.metadata.description}`)
    console.log(`  Version: ${skill.metadata.version}`)
    console.log(`  Source: ${skill.source}`)
    console.log(`  Path: ${skill.path}`)
    console.log(`  Output target: ${skill.metadata.output.target}`)
    console.log(`  Allowed tools: ${skill.metadata.allowedTools.join(', ')}`)
    if (skill.metadata.params.length > 0) {
      console.log(`\n  Parameters:`)
      for (const p of skill.metadata.params) {
        const req = p.required ? '(required)' : `(optional, default: ${JSON.stringify(p.default)})`
        console.log(`    ${p.name}: ${p.type} — ${p.description} ${req}`)
      }
    }
    console.log()
  })

program.addCommand(skillsCmd)

// --- daemon subcommand ---
const daemonCmd = new Command('daemon')
  .description('Manage the background daemon')

daemonCmd
  .command('start')
  .description('Start the daemon in the foreground')
  .action(async () => {
    ensureDirectories()
    await startDaemon()
  })

daemonCmd
  .command('stop')
  .description('Stop the daemon')
  .action(() => {
    stopDaemon()
  })

daemonCmd
  .command('status')
  .description('Show daemon status')
  .option('--json', 'Output as JSON')
  .action(async (opts: { json?: boolean }) => {
    const local = getDaemonStatus()
    if (!local.running) {
      if (opts.json) {
        console.log(JSON.stringify({ running: false }))
      } else {
        console.log('Daemon is not running.')
      }
      return
    }

    // Get detailed status via IPC
    const response = await sendIpcRequest('daemon:status')
    if (opts.json) {
      console.log(JSON.stringify(response.success ? response.data : { running: true, pid: local.pid }))
    } else if (response.success) {
      const data = response.data as Record<string, unknown>
      console.log(`Daemon running (pid: ${data['pid']})`)
      console.log(`  Active schedules: ${data['activeSchedules']}`)
      console.log(`  Queue pending: ${data['queuePending']}`)
      console.log(`  Queue executing: ${data['queueExecuting']}`)
      if (data['circuitOpen']) console.log('  Circuit breaker: OPEN (paused)')
    } else {
      console.log(`Daemon running (pid: ${local.pid}) but IPC unavailable.`)
    }
  })

program.addCommand(daemonCmd)

// --- schedules subcommand ---
const schedulesCmd = new Command('schedules')
  .description('Manage schedules')

schedulesCmd
  .command('list')
  .description('List all schedules')
  .option('--json', 'Output as JSON')
  .action((opts: { json?: boolean }) => {
    ensureDirectories()
    const result = loadSchedules()
    if (!result.ok) {
      console.error(result.error)
      process.exit(1)
    }
    const schedules = result.value

    if (opts.json) {
      console.log(JSON.stringify(schedules, null, 2))
      return
    }

    if (schedules.length === 0) {
      console.log('No schedules configured.')
      return
    }

    console.log(`\n  Schedules (${schedules.length}):\n`)
    for (const s of schedules) {
      const status = s.enabled ? 'active' : 'paused'
      console.log(`  ${s.id.padEnd(12)} ${s.name}`)
      console.log(`  ${''.padEnd(12)} skill: ${s.skill}  cron: ${s.cron}  [${status}]`)
      if (s.last_run) {
        console.log(`  ${''.padEnd(12)} last run: ${s.last_run} (${s.last_status ?? 'unknown'})`)
      }
      console.log()
    }
  })

schedulesCmd
  .command('create')
  .description('Create a new schedule')
  .requiredOption('--skill <skill>', 'Skill slug to schedule')
  .requiredOption('--cron <expression>', 'Cron expression (5-field)')
  .option('--name <name>', 'Human-readable schedule name')
  .option('--param <params...>', 'Parameters as key=value pairs')
  .option('--json', 'Output as JSON')
  .action((opts: { skill: string; cron: string; name?: string; param?: string[]; json?: boolean }) => {
    ensureDirectories()

    // Verify skill exists
    const skillCheck = loadSkill(opts.skill)
    if (!skillCheck.ok) {
      if (opts.json) {
        console.log(JSON.stringify({ ok: false, error: skillCheck.error }))
      } else {
        console.error(skillCheck.error)
      }
      process.exit(1)
    }

    // Validate cron expression
    const cron = validateCron(opts.cron)
    if (!cron) {
      const msg = `Invalid cron expression: "${opts.cron}"`
      if (opts.json) {
        console.log(JSON.stringify({ ok: false, error: msg }))
      } else {
        console.error(msg)
      }
      process.exit(1)
    }

    // Parse params
    const params: Record<string, string> = {}
    if (opts.param) {
      for (const p of opts.param) {
        const eqIndex = p.indexOf('=')
        if (eqIndex === -1) {
          console.error(`Invalid param format: "${p}" (expected key=value)`)
          process.exit(1)
        }
        params[p.slice(0, eqIndex)] = p.slice(eqIndex + 1)
      }
    }

    const id = generateScheduleId()
    const schedule = {
      id: id as string,
      name: opts.name ?? `${opts.skill} schedule`,
      cron: opts.cron,
      skill: opts.skill,
      params,
      enabled: true,
      created_at: new Date().toISOString(),
    }

    const result = saveSchedule(schedule)
    if (!result.ok) {
      if (opts.json) {
        console.log(JSON.stringify({ ok: false, error: result.error }))
      } else {
        console.error(result.error)
      }
      process.exit(1)
    }

    const nextRuns = getNextRuns(opts.cron, 3)

    if (opts.json) {
      console.log(JSON.stringify({ ok: true, schedule, nextRuns }))
    } else {
      console.log(`Schedule created: ${schedule.id}`)
      console.log(`  Name: ${schedule.name}`)
      console.log(`  Skill: ${schedule.skill}`)
      console.log(`  Cron: ${schedule.cron}`)
      if (nextRuns.length > 0) {
        console.log(`  Next runs:`)
        for (const run of nextRuns) {
          console.log(`    - ${new Date(run).toLocaleString()}`)
        }
      }
    }
  })

schedulesCmd
  .command('delete <id>')
  .description('Delete a schedule')
  .action(async (id: string) => {
    const response = await sendIpcRequest('schedule:delete', { id })
    if (response.success) {
      console.log(`Schedule "${id}" deleted.`)
    } else {
      console.error(response.error)
      process.exit(1)
    }
  })

schedulesCmd
  .command('enable <id>')
  .description('Enable a schedule')
  .action(async (id: string) => {
    const response = await sendIpcRequest('schedule:enable', { id, enabled: true })
    if (response.success) {
      console.log(`Schedule "${id}" enabled.`)
    } else {
      console.error(response.error)
      process.exit(1)
    }
  })

schedulesCmd
  .command('disable <id>')
  .description('Disable a schedule')
  .action(async (id: string) => {
    const response = await sendIpcRequest('schedule:enable', { id, enabled: false })
    if (response.success) {
      console.log(`Schedule "${id}" disabled.`)
    } else {
      console.error(response.error)
      process.exit(1)
    }
  })

program.addCommand(schedulesCmd)

// --- run subcommand ---
program
  .command('run <skill>')
  .description('Run a skill immediately')
  .option('--repo <repo>', 'GitHub repo (owner/repo)')
  .option('--param <params...>', 'Parameters as key=value pairs')
  .option('--json', 'Output as JSON')
  .option('--timeout <ms>', 'Timeout in milliseconds')
  .option('--resume <sessionId>', 'Resume an existing session')
  .action(async (skill: string, opts: { repo?: string; param?: string[]; json?: boolean; timeout?: string; resume?: string }) => {
    ensureDirectories()

    // Verify skill exists before executing
    const skillCheck = loadSkill(skill)
    if (!skillCheck.ok) {
      if (opts.json) {
        console.log(JSON.stringify({ ok: false, error: skillCheck.error }))
      } else {
        console.error(skillCheck.error)
      }
      process.exit(1)
    }

    const params: Record<string, string> = {}
    if (opts.repo) params['repo'] = opts.repo
    if (opts.param) {
      for (const p of opts.param) {
        const eqIndex = p.indexOf('=')
        if (eqIndex === -1) {
          console.error(`Invalid param format: "${p}" (expected key=value)`)
          process.exit(1)
        }
        params[p.slice(0, eqIndex)] = p.slice(eqIndex + 1)
      }
    }

    if (!opts.json) {
      console.log(`Running skill "${skillCheck.value.metadata.name}"...`)
    }

    const result = await executeSkill({
      skillSlug: skill,
      params,
      timeoutMs: opts.timeout ? Number(opts.timeout) : undefined,
      resumeSessionId: opts.resume,
      onMessage: opts.json ? undefined : (msg) => {
        if (msg.type === 'assistant') {
          // Show streaming assistant text content
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text) {
              process.stdout.write('.')
            }
          }
        }
      },
    })

    if (opts.json) {
      console.log(JSON.stringify(result, null, 2))
    } else if (result.ok) {
      console.log('\n')
      console.log(`Completed in ${(result.duration / 1000).toFixed(1)}s | Cost: $${result.cost.toFixed(4)}`)
      console.log(`Session: ${result.sessionId}`)
      if (result.output) {
        console.log(`\nOutput:\n${result.output}`)
      }
    } else {
      console.error(`\nFailed (${result.code}): ${result.error}`)
      process.exit(1)
    }
  })

export function run(argv: string[]): void {
  program.parse(argv)
}
