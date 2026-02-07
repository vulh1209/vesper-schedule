import React from 'react'
import { Box, Text } from 'ink'
import { Spinner } from '@inkjs/ui'

interface JobStatusProps {
  readonly label: string
}

export function JobStatus({ label }: JobStatusProps): React.JSX.Element {
  return (
    <Box>
      <Spinner label={label} />
    </Box>
  )
}

interface MessageProps {
  readonly role: 'user' | 'assistant' | 'system'
  readonly content: string
}

export function ChatMessage({ role, content }: MessageProps): React.JSX.Element {
  const color = role === 'user' ? 'blue' : role === 'assistant' ? 'green' : 'yellow'
  const prefix = role === 'user' ? 'You' : role === 'assistant' ? 'Vesper' : 'System'

  return (
    <Box>
      <Text bold color={color}>{`${prefix}: `}</Text>
      <Text>{content}</Text>
    </Box>
  )
}
