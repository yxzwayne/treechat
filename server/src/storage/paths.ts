import os from 'node:os'
import path from 'node:path'

export function getDataDir(): string {
  const override = process.env.TREECHAT_DATA_DIR
  if (override && override.trim()) return path.resolve(override)
  return path.join(os.homedir(), '.treechat', 'data')
}

export function metaPath(dataDir: string): string {
  return path.join(dataDir, 'meta.json')
}

export function conversationsDir(dataDir: string): string {
  return path.join(dataDir, 'conversations')
}

export function conversationDir(dataDir: string, conversationId: string): string {
  return path.join(conversationsDir(dataDir), conversationId)
}

export function conversationJsonPath(dataDir: string, conversationId: string): string {
  return path.join(conversationDir(dataDir, conversationId), 'conversation.json')
}

export function messagesDir(dataDir: string, conversationId: string): string {
  return path.join(conversationDir(dataDir, conversationId), 'messages')
}

export function messageJsonPath(dataDir: string, conversationId: string, messageId: string): string {
  return path.join(messagesDir(dataDir, conversationId), `${messageId}.json`)
}

export function modelsDir(dataDir: string): string {
  return path.join(dataDir, 'models')
}

export function modelConfigPath(dataDir: string): string {
  return path.join(modelsDir(dataDir), 'config.json')
}

export function openrouterCatalogPath(dataDir: string): string {
  return path.join(modelsDir(dataDir), 'openrouter_catalog.json')
}

