import { useState, useEffect, useCallback } from 'react'
import { sendIpcRequest, isDaemonRunning } from '../../ipc/client.js'
import type { IpcResponse } from '../../ipc/protocol.js'
import type { Schedule } from '../../core/schemas.js'

interface DaemonState {
  connected: boolean
  schedules: Schedule[]
  checking: boolean
}

interface DaemonActions {
  checkConnection: () => Promise<void>
  sendRequest: (type: string, payload?: Record<string, unknown>) => Promise<IpcResponse>
  refreshSchedules: () => Promise<void>
}

export type UseDaemonReturn = DaemonState & DaemonActions

export function useDaemon(): UseDaemonReturn {
  const [connected, setConnected] = useState(false)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [checking, setChecking] = useState(true)

  const checkConnection = useCallback(async () => {
    setChecking(true)
    const running = await isDaemonRunning()
    setConnected(running)
    setChecking(false)
  }, [])

  const sendRequest = useCallback(async (type: string, payload: Record<string, unknown> = {}): Promise<IpcResponse> => {
    const response = await sendIpcRequest(type, payload)
    if (!response.success) {
      // Connection might have dropped
      setConnected(false)
    }
    return response
  }, [])

  const refreshSchedules = useCallback(async () => {
    const response = await sendIpcRequest('schedule:list')
    if (response.success) {
      setSchedules(response.data as Schedule[])
    }
  }, [])

  // Check connection on mount
  useEffect(() => {
    void checkConnection()
  }, [checkConnection])

  return {
    connected,
    schedules,
    checking,
    checkConnection,
    sendRequest,
    refreshSchedules,
  }
}
