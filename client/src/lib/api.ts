import { Role } from '../types'

export async function streamChat(model: string, messages: { role: Role; content: string }[], onDelta: (t: string) => void, opts?: { conversationId?: string, assistantExternalId?: string }) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, conversationId: opts?.conversationId, assistantExternalId: opts?.assistantExternalId })
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text}`)
  }
  if (!res.body) throw new Error('API error: empty body')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value)
    onDelta(chunk)
  }
}

export async function createConversation(): Promise<string> {
  const res = await fetch('/api/conversations', { method: 'POST' })
  if (!res.ok) throw new Error('Failed to create conversation')
  const j = await res.json()
  return j.id as string
}

export async function saveSnapshot(conversationId: string, snapshot: any): Promise<void> {
  const res = await fetch(`/api/conversations/${conversationId}/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(snapshot)
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Failed to save snapshot: ${t}`)
  }
}

export async function loadLatestSnapshot(): Promise<{ id: string, snapshot: any }> {
  const res = await fetch('/api/conversations/latest')
  if (!res.ok) throw new Error('No conversations found')
  return res.json()
}

export async function loadConversation(id: string): Promise<any> {
  const res = await fetch(`/api/conversations/${id}`)
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Failed to load conversation ${id}: ${t}`)
  }
  return res.json()
}

export async function upsertMessage(conversationId: string, message: { external_id: string, parent_external_id?: string | null, role: Role, content: string, model?: string, created_ts: number }) {
  const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Failed to upsert message: ${t}`)
  }
}

export async function deleteMessage(conversationId: string, externalId: string): Promise<void> {
  const res = await fetch(`/api/conversations/${conversationId}/messages/${externalId}`, {
    method: 'DELETE'
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`Failed to delete message: ${t}`)
  }
}
