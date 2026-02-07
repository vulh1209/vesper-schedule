import { useState, useCallback } from 'react'

export interface ChatMessageItem {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatState {
  messages: ChatMessageItem[]
  isProcessing: boolean
}

interface ChatActions {
  addMessage: (role: ChatMessageItem['role'], content: string) => void
  setProcessing: (processing: boolean) => void
  clearMessages: () => void
}

export type UseChatReturn = ChatState & ChatActions

let messageCounter = 0

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessageItem[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  const addMessage = useCallback((role: ChatMessageItem['role'], content: string) => {
    messageCounter++
    const id = `msg-${messageCounter}`
    setMessages(prev => [...prev, { id, role, content }])
  }, [])

  const setProcessing = useCallback((processing: boolean) => {
    setIsProcessing(processing)
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    isProcessing,
    addMessage,
    setProcessing,
    clearMessages,
  }
}
