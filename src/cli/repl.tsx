import React, { useCallback } from 'react'
import { render, Box, Text, useApp } from 'ink'
import { TextInput, Spinner } from '@inkjs/ui'
import { Welcome } from './components/Welcome.js'
import { DaemonIndicator } from './components/DaemonIndicator.js'
import { ChatMessage } from './components/JobStatus.js'
import { useChat } from './hooks/useChat.js'
import { useDaemon } from './hooks/useDaemon.js'
import { parseIntent, type ParsedIntent } from '../parser/intent.js'
import { loadAllSkills, type LoadedSkill } from '../skills/loader.js'
import { loadSchedules } from '../daemon/schedules.js'
import { executeSkill } from '../worker/executor.js'
import { parseCronExpression } from '../parser/cron-parser.js'
import { saveSchedule, generateScheduleId } from '../daemon/schedules.js'

function App(): React.JSX.Element {
  const { exit } = useApp()
  const chat = useChat()
  const daemon = useDaemon()

  const handleCommand = useCallback(async (intent: ParsedIntent) => {
    switch (intent.type) {
      case 'command': {
        const { command, args } = intent
        switch (command) {
          case 'help':
            chat.addMessage('system',
              'Commands: status, list, logs [id], enable <id>, disable <id>, delete <id>, daemon start|stop|status, help, quit')
            break
          case 'quit':
          case 'exit':
            chat.addMessage('system', 'Goodbye!')
            setTimeout(() => exit(), 100)
            break
          case 'status': {
            if (daemon.connected) {
              const response = await daemon.sendRequest('daemon:status')
              if (response.success) {
                const data = response.data as Record<string, unknown>
                chat.addMessage('system',
                  `Daemon running (pid: ${data['pid']}), schedules: ${data['activeSchedules']}, queue: ${data['queuePending']} pending`)
              } else {
                chat.addMessage('system', `Daemon status error: ${response.error}`)
              }
            } else {
              chat.addMessage('system', 'Daemon is not running. Start with "daemon start".')
            }
            break
          }
          case 'list': {
            const result = loadSchedules()
            if (result.ok) {
              // Show schedule table as text for now
              if (result.value.length === 0) {
                chat.addMessage('system', 'No schedules configured.')
              } else {
                const lines = result.value.map(s => {
                  const status = s.enabled ? 'active' : 'paused'
                  return `  ${s.id}  ${s.name}  (${s.skill}, ${s.cron}) [${status}]`
                })
                chat.addMessage('system', `Schedules:\n${lines.join('\n')}`)
              }
            } else {
              chat.addMessage('system', result.error)
            }
            break
          }
          case 'enable':
          case 'disable': {
            const id = args[0]
            if (!id) {
              chat.addMessage('system', `Usage: ${command} <schedule-id>`)
              break
            }
            const response = await daemon.sendRequest('schedule:enable', { id, enabled: command === 'enable' })
            if (response.success) {
              chat.addMessage('system', `Schedule "${id}" ${command}d.`)
            } else {
              chat.addMessage('system', response.error)
            }
            break
          }
          case 'delete': {
            const id = args[0]
            if (!id) {
              chat.addMessage('system', 'Usage: delete <schedule-id>')
              break
            }
            const response = await daemon.sendRequest('schedule:delete', { id })
            if (response.success) {
              chat.addMessage('system', `Schedule "${id}" deleted.`)
            } else {
              chat.addMessage('system', response.error)
            }
            break
          }
          case 'logs': {
            chat.addMessage('system', 'Log viewer coming soon. Check ~/.vesper-schedule/logs/ directly.')
            break
          }
          case 'daemon': {
            const subCmd = args[0]
            if (subCmd === 'status') {
              await daemon.checkConnection()
              chat.addMessage('system', daemon.connected ? 'Daemon is running.' : 'Daemon is not running.')
            } else if (subCmd === 'start' || subCmd === 'stop') {
              chat.addMessage('system', `Use CLI: vesper-schedule daemon ${subCmd}`)
            } else {
              chat.addMessage('system', 'Usage: daemon start|stop|status')
            }
            break
          }
          default:
            chat.addMessage('system', `Unknown command: ${command}`)
        }
        break
      }
      case 'run-now': {
        chat.addMessage('assistant', `Running skill "${intent.skill}"...`)
        chat.setProcessing(true)
        const result = await executeSkill({
          skillSlug: intent.skill,
          params: intent.params,
        })
        chat.setProcessing(false)
        if (result.ok) {
          chat.addMessage('assistant',
            `Done in ${(result.duration / 1000).toFixed(1)}s (cost: $${result.cost.toFixed(4)})\n${result.output ? result.output.slice(0, 500) : ''}`)
        } else {
          chat.addMessage('system', `Failed (${result.code}): ${result.error}`)
        }
        break
      }
      case 'schedule': {
        // Validate cron
        const cronResult = await parseCronExpression(intent.cron)
        const cronExpr = cronResult?.expression ?? intent.cron

        const id = generateScheduleId()
        const schedule = {
          id: id as string,
          name: intent.name,
          cron: cronExpr,
          skill: intent.skill,
          params: intent.params,
          enabled: true,
          created_at: new Date().toISOString(),
        }

        const saveResult = saveSchedule(schedule)
        if (saveResult.ok) {
          chat.addMessage('assistant',
            `Schedule created: "${intent.name}" (${intent.skill}, ${cronExpr})\n` +
            (cronResult ? `Next runs: ${cronResult.nextRuns.map(r => new Date(r).toLocaleString()).join(', ')}` : ''))
          // Notify daemon if connected
          if (daemon.connected) {
            await daemon.sendRequest('schedule:create', schedule)
          }
        } else {
          chat.addMessage('system', `Failed to save schedule: ${saveResult.error}`)
        }
        break
      }
      case 'unknown':
        chat.addMessage('system', `I didn't understand that. Type "help" for available commands.`)
        break
      case 'resume':
        chat.addMessage('system', 'Session resume from REPL is not yet supported.')
        break
    }
  }, [chat, daemon, exit])

  const handleSubmit = useCallback(async (input: string) => {
    const trimmed = input.trim()
    if (!trimmed) return

    chat.addMessage('user', trimmed)
    chat.setProcessing(true)

    // Load skills for intent parsing
    const skillsResult = loadAllSkills()
    const skills: LoadedSkill[] = skillsResult.ok ? skillsResult.value : []

    const intent = await parseIntent(trimmed, skills)
    chat.setProcessing(false)

    await handleCommand(intent)
  }, [chat, handleCommand])

  return (
    <Box flexDirection="column">
      <Welcome />
      <DaemonIndicator connected={daemon.connected} />

      <Box flexDirection="column" marginTop={1}>
        {chat.messages.map(msg => (
          <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
        ))}
      </Box>

      {chat.isProcessing && (
        <Box marginTop={1}>
          <Spinner label="Thinking..." />
        </Box>
      )}

      <Box marginTop={1}>
        <Text bold color="cyan">{'> '}</Text>
        <TextInput
          placeholder="Type a command or chat..."
          isDisabled={chat.isProcessing}
          onSubmit={handleSubmit}
        />
      </Box>
    </Box>
  )
}

export function startRepl(): void {
  // Bun workaround: must call stdin.resume() before ink render
  process.stdin.resume()

  const { waitUntilExit } = render(<App />)
  void waitUntilExit()
}
