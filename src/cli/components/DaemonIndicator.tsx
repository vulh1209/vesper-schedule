import React from 'react'
import { Text } from 'ink'

interface DaemonIndicatorProps {
  readonly connected: boolean
}

export function DaemonIndicator({ connected }: DaemonIndicatorProps): React.JSX.Element {
  if (connected) {
    return <Text color="green">[daemon: connected]</Text>
  }
  return <Text color="yellow">[daemon: offline]</Text>
}
