import { Command } from 'commander'
import { loadAllSkills, loadSkill } from '../skills/loader.js'
import { executeSkill } from '../worker/executor.js'
import { checkSetup, runFirstTimeSetup } from '../core/setup.js'
import { ensureDirectories } from '../core/paths.js'

const program = new Command()

program
  .name('vesper-schedule')
  .description('CLI tool for scheduling and executing GitHub automation with Claude Code SDK')
  .version('0.1.0')

// --- Default action: REPL (placeholder for Phase 4) ---
program
  .action(() => {
    const setup = checkSetup()
    if (!setup.ok) {
      console.error(`Setup check failed: ${setup.error}`)
      process.exit(1)
    }
    if (setup.value.firstRun) {
      console.log('First run detected. Setting up ~/.vesper-schedule/ ...')
      const result = runFirstTimeSetup()
      if (!result.ok) {
        console.error(result.error)
        process.exit(1)
      }
      console.log('Setup complete.')
    }
    if (!setup.value.ghAuthenticated) {
      console.warn('Warning: gh CLI not authenticated. Run `gh auth login` first.')
    }
    console.log('REPL mode coming in Phase 4. Use subcommands for now.')
    console.log('Run `vesper-schedule --help` for available commands.')
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

// --- daemon subcommand (placeholder for Phase 3) ---
const daemonCmd = new Command('daemon')
  .description('Manage the background daemon')

daemonCmd
  .command('start')
  .description('Start the daemon')
  .action(() => {
    console.log('Daemon start coming in Phase 3.')
  })

daemonCmd
  .command('stop')
  .description('Stop the daemon')
  .action(() => {
    console.log('Daemon stop coming in Phase 3.')
  })

daemonCmd
  .command('status')
  .description('Show daemon status')
  .option('--json', 'Output as JSON')
  .action((opts: { json?: boolean }) => {
    if (opts.json) {
      console.log(JSON.stringify({ running: false, message: 'Daemon not implemented yet (Phase 3)' }))
      return
    }
    console.log('Daemon status coming in Phase 3.')
  })

program.addCommand(daemonCmd)

// --- schedules subcommand (placeholder for Phase 3) ---
const schedulesCmd = new Command('schedules')
  .description('Manage schedules')

schedulesCmd
  .command('list')
  .description('List all schedules')
  .option('--json', 'Output as JSON')
  .action((opts: { json?: boolean }) => {
    if (opts.json) {
      console.log(JSON.stringify([]))
      return
    }
    console.log('No schedules configured. Create one via the REPL (Phase 4).')
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
