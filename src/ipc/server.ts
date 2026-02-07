import { existsSync, unlinkSync, chmodSync } from 'node:fs'
import { PATHS } from '../core/paths.js'
import { writeDaemonLog } from '../daemon/logger.js'
import { type IpcRequest, type IpcResponse, serialize, parseNdjson } from './protocol.js'

export type IpcHandler = (request: IpcRequest) => Promise<IpcResponse>

interface ConnectedSocket {
  write(data: string | Buffer): number
}

/**
 * IPC server: listens on Unix domain socket for NDJSON messages.
 * Chmod 0600 for owner-only access.
 */
export class IpcServer {
  private server: ReturnType<typeof Bun.listen> | null = null
  private socketPath: string
  private handler: IpcHandler

  constructor(handler: IpcHandler, socketPath?: string) {
    this.socketPath = socketPath ?? PATHS.daemon.socket
    this.handler = handler
  }

  /** Start listening. Cleans up stale socket first. */
  async listen(): Promise<void> {
    await this.cleanupStaleSocket()

    this.server = Bun.listen({
      unix: this.socketPath,
      socket: {
        data: (socket: ConnectedSocket, data: Buffer) => {
          this.handleData(socket, data)
        },
        open: () => {
          writeDaemonLog('debug', 'IPC client connected')
        },
        close: () => {
          writeDaemonLog('debug', 'IPC client disconnected')
        },
        error: (_socket: ConnectedSocket, error: Error) => {
          writeDaemonLog('error', `IPC socket error: ${error.message}`)
        },
      },
    })

    // Set socket permissions to owner-only (0600)
    try {
      chmodSync(this.socketPath, 0o600)
    } catch {
      writeDaemonLog('warn', 'Could not set socket permissions to 0600')
    }

    writeDaemonLog('info', `IPC server listening on ${this.socketPath}`)
  }

  /** Close server and clean up socket file */
  async close(): Promise<void> {
    if (this.server) {
      this.server.stop()
      this.server = null
    }
    if (existsSync(this.socketPath)) {
      try {
        unlinkSync(this.socketPath)
      } catch {
        // Best effort
      }
    }
  }

  private buffers = new WeakMap<ConnectedSocket, string>()

  private handleData(socket: ConnectedSocket, data: Buffer): void {
    const existing = this.buffers.get(socket) ?? ''
    const combined = existing + data.toString()
    const { messages, remainder } = parseNdjson(combined)
    this.buffers.set(socket, remainder)

    for (const msg of messages) {
      const request = msg as IpcRequest
      this.handler(request)
        .then(response => {
          socket.write(serialize(response))
        })
        .catch(e => {
          const error = e instanceof Error ? e.message : String(e)
          const errorResponse: IpcResponse = { id: request.id ?? 'unknown', success: false, error }
          socket.write(serialize(errorResponse))
        })
    }
  }

  /** Remove stale socket file if daemon is not running */
  private async cleanupStaleSocket(): Promise<void> {
    if (!existsSync(this.socketPath)) return

    // Try connecting — if it fails, socket is stale
    try {
      const testSocket = await Bun.connect({
        unix: this.socketPath,
        socket: {
          data() { /* noop */ },
          open(s) { s.end() },
          error() { /* noop */ },
          close() { /* noop */ },
        },
      })
      // Connection succeeded — another daemon is running
      testSocket.end()
      throw new Error(`Another daemon is already running (socket at ${this.socketPath})`)
    } catch (e) {
      if (e instanceof Error && e.message.includes('Another daemon')) throw e
      // Connection failed — stale socket, remove it
      try {
        unlinkSync(this.socketPath)
        writeDaemonLog('info', 'Removed stale socket file')
      } catch {
        // Ignore
      }
    }
  }
}
