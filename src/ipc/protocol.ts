/** IPC message types for REPL ↔ Daemon communication over Unix socket (NDJSON framing) */

export interface IpcRequest {
  version: number
  id: string
  type: string
  payload: Record<string, unknown>
}

export interface IpcSuccessResponse {
  id: string
  success: true
  data: unknown
}

export interface IpcErrorResponse {
  id: string
  success: false
  error: string
}

export type IpcResponse = IpcSuccessResponse | IpcErrorResponse

/** Generate a request correlation ID */
export function requestId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** Serialize a message for NDJSON transport */
export function serialize(msg: IpcRequest | IpcResponse): string {
  return JSON.stringify(msg) + '\n'
}

/** Parse NDJSON buffer into messages. Returns parsed messages and remaining buffer. */
export function parseNdjson(buffer: string): { messages: unknown[]; remainder: string } {
  const lines = buffer.split('\n')
  const messages: unknown[] = []
  let remainder = ''

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (i === lines.length - 1 && !buffer.endsWith('\n')) {
      // Last chunk may be incomplete
      remainder = lines[i]!
      break
    }
    if (line === '') continue
    try {
      messages.push(JSON.parse(line))
    } catch {
      // Skip malformed lines
    }
  }

  return { messages, remainder }
}
