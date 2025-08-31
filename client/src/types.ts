export type Role = 'system' | 'user' | 'assistant'

export type MessageNode = {
  id: string
  role: Role
  content: string
  parentId?: string | null
  children: string[]
  createdAt: number
  model?: string
}

export type ConversationState = {
  nodes: Record<string, MessageNode>
  rootId: string
  selectedLeafId: string
}

export type ChatRequest = {
  model: string
  messages: { role: Role; content: string }[]
}
