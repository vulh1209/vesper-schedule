import React from 'react'
import { Box, Text } from 'ink'
import type { Schedule } from '../../core/schemas.js'

interface ScheduleTableProps {
  readonly schedules: Schedule[]
}

export function ScheduleTable({ schedules }: ScheduleTableProps): React.JSX.Element {
  if (schedules.length === 0) {
    return <Text dimColor>No schedules configured.</Text>
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold>
          {pad('ID', 12)}{pad('Name', 24)}{pad('Skill', 16)}{pad('Cron', 18)}{pad('Status', 8)}
        </Text>
      </Box>
      {schedules.map(s => (
        <Box key={s.id}>
          <Text>
            {pad(s.id, 12)}
            {pad(s.name, 24)}
            {pad(s.skill, 16)}
            {pad(s.cron, 18)}
          </Text>
          <Text color={s.enabled ? 'green' : 'yellow'}>
            {s.enabled ? 'active' : 'paused'}
          </Text>
        </Box>
      ))}
    </Box>
  )
}

function pad(str: string, width: number): string {
  return str.length >= width ? str.slice(0, width - 1) + ' ' : str.padEnd(width)
}
