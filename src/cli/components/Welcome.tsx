import React from 'react'
import { Box, Text } from 'ink'

export function Welcome(): React.JSX.Element {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text bold color="cyan">
        {'  vesper-schedule v0.1.0'}
      </Text>
      <Text dimColor>
        {'  Schedule and run GitHub automation with natural language.'}
      </Text>
      <Text dimColor>
        {'  Type "help" for commands, or chat naturally to get started.'}
      </Text>
    </Box>
  )
}
