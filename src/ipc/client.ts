import { existsSync } from 'node:fs'
import { PATHS } from '../core/paths.js'
import { type IpcRequest, type IpcResponse, serialize, parseNdjson, requestId } from './protocol.js'

const DEFAULT_TIMEOUT_MS = 5000

/**
 * IPC client: connects to daemon Unix socket, sends request, waits for response.
 */
export async function sendIpcRequest(
  type: string,
  payload: Record<string, unknown> = {},
  socketPath?: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<IpcResponse> {
  const path = socketPath ?? PATHS.daemon.socket

  if (!existsSync(path)) {
    return { id: '', success: false, error: 'Daemon not running (no socket file)' }
  }

  const id = requestId()
  const request: IpcRequest = { version: 1, id, type, payload }

  return new Promise<IpcResponse>((resolve) => {
    let buffer = ''
    let resolved = false

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true
        resolve({ id, success: false, error: `IPC request timed out after ${timeoutMs}ms` })
      }
    }, timeoutMs)

    Bun.connect({
      unix: path,
      socket: {
        open(socket) {
          socket.write(serialize(request))
        },
        data(_socket, data) {
          buffer += data.toString()
          const { messages } = parseNdjson(buffer)
          for (const msg of messages) {
            const response = msg as IpcResponse
            if (response.id === id) {
              resolved = true
              clearTimeout(timer)
              _socket.end()
              resolve(response)
              return
            }
          }
        },
        error(_socket, error) {
          if (!resolved) {
            resolved = true
            clearTimeout(timer)
            resolve({ id, success: false, error: `IPC connection error: ${error.message}` })
          }
        },
        close() {
          if (!resolved) {
            resolved = true
            clearTimeout(timer)
            resolve({ id, success: false, error: 'IPC connection closed unexpectedly' })
          }
        },
      },
    }).catch(e => {
      if (!resolved) {
        resolved = true
        clearTimeout(timer)
        const message = e instanceof Error ? e.message : String(e)
        resolve({ id, success: false, error: `Cannot connect to daemon: ${message}` })
      }
    })
  })
}

/** Check if daemon is running by trying to connect to socket */
export async function isDaemonRunning(socketPath?: string): Promise<boolean> {
  const response = await sendIpcRequest('daemon:status', {}, socketPath, 2000)
  return response.success
}
