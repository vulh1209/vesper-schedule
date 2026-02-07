/**
 * Ink + Bun compatibility test.
 * Tests: rendering, spinner, text output.
 * NOTE: TextInput requires TTY (interactive terminal), so we only test render here.
 */
import React from 'react'
import { render, Box, Text } from 'ink'
import { Spinner } from '@inkjs/ui'

function TestApp() {
  return (
    <Box flexDirection="column">
      <Text color="green">Ink renders correctly under Bun!</Text>
      <Box>
        <Spinner label="Spinner works" />
      </Box>
      <Text>Test complete.</Text>
    </Box>
  )
}

// Bun workaround: call process.stdin.resume() before render
process.stdin.resume()

const { unmount } = render(<TestApp />)

// Auto-exit after 1 second (enough to verify rendering)
setTimeout(() => {
  unmount()
  process.exit(0)
}, 1000)
