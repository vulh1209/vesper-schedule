import { describe, test, expect } from 'bun:test'
import {
  serialize,
  parseNdjson,
  requestId,
  type IpcRequest,
  type IpcSuccessResponse,
  type IpcErrorResponse,
} from '../../../src/ipc/protocol.js'

describe('requestId', () => {
  test('generates non-empty string', () => {
    const id = requestId()
    expect(id).toBeTruthy()
    expect(typeof id).toBe('string')
  })

  test('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => requestId()))
    // With 8-char random strings, collisions extremely unlikely
    expect(ids.size).toBe(100)
  })
})

describe('serialize', () => {
  test('serializes request with trailing newline', () => {
    const msg: IpcRequest = {
      version: 1,
      id: 'req-1',
      type: 'schedule:list',
      payload: {},
    }
    const result = serialize(msg)
    expect(result).toEndWith('\n')
    const parsed = JSON.parse(result)
    expect(parsed.type).toBe('schedule:list')
  })

  test('serializes success response', () => {
    const msg: IpcSuccessResponse = {
      id: 'req-1',
      success: true,
      data: [{ id: 'sched-1' }],
    }
    const result = serialize(msg)
    const parsed = JSON.parse(result)
    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual([{ id: 'sched-1' }])
  })

  test('serializes error response', () => {
    const msg: IpcErrorResponse = {
      id: 'req-1',
      success: false,
      error: 'not found',
    }
    const result = serialize(msg)
    const parsed = JSON.parse(result)
    expect(parsed.success).toBe(false)
    expect(parsed.error).toBe('not found')
  })
})

describe('parseNdjson', () => {
  test('parses single complete message', () => {
    const buffer = '{"type":"status"}\n'
    const { messages, remainder } = parseNdjson(buffer)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toEqual({ type: 'status' })
    expect(remainder).toBe('')
  })

  test('parses multiple messages', () => {
    const buffer = '{"a":1}\n{"b":2}\n{"c":3}\n'
    const { messages, remainder } = parseNdjson(buffer)
    expect(messages).toHaveLength(3)
    expect(remainder).toBe('')
  })

  test('handles incomplete last message', () => {
    const buffer = '{"a":1}\n{"incomplete'
    const { messages, remainder } = parseNdjson(buffer)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toEqual({ a: 1 })
    expect(remainder).toBe('{"incomplete')
  })

  test('skips malformed lines', () => {
    const buffer = '{"valid":true}\nnot json\n{"also":true}\n'
    const { messages, remainder } = parseNdjson(buffer)
    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual({ valid: true })
    expect(messages[1]).toEqual({ also: true })
  })

  test('skips empty lines', () => {
    const buffer = '{"a":1}\n\n{"b":2}\n'
    const { messages, remainder } = parseNdjson(buffer)
    expect(messages).toHaveLength(2)
  })

  test('empty buffer returns nothing', () => {
    const { messages, remainder } = parseNdjson('')
    expect(messages).toHaveLength(0)
    expect(remainder).toBe('')
  })

  test('roundtrips with serialize', () => {
    const msg: IpcRequest = {
      version: 1,
      id: 'test',
      type: 'daemon:status',
      payload: {},
    }
    const serialized = serialize(msg)
    const { messages } = parseNdjson(serialized)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toEqual(msg)
  })
})
