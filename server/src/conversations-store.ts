import fsp from 'node:fs/promises'
import { constants as FS_CONSTANTS } from 'node:fs'
import type { Dirent } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

import { atomicWriteJson, mkdirp, pathExists, readJsonFile, readJsonIfExists } from './storage/fs-json.js'
import { assertMessageId, assertUuid } from './storage/ids.js'
import { getDataDir, conversationDir, conversationJsonPath, conversationsDir, messageJsonPath, messagesDir, metaPath } from './storage/paths.js'
import { MutexMap } from './storage/mutex.js'

export type ConversationMeta = {
  schemaVersion: 1
  id: string
  summary: string | null
  status: 'active'
  createdAtMs: number
  updatedAtMs: number
}

export type StoredMessage = {
  schemaVersion: 1
  id: string
  conversationId: string
  parentId: string | null
  role: 'system' | 'user' | 'assistant'
  content: string
  model: string | null
  createdTsMs: number
  updatedAtMs: number
}

export type SnapshotNode = {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  parentId?: string | null
  children: string[]
  createdAt: number
  model?: string
}

export type SnapshotState = {
  nodes: Record<string, SnapshotNode>
  rootId: string
  selectedLeafId: string
}

const conversationLocks = new MutexMap<string>()

function toSafeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return fallback
}

async function ensureMetaFile(dataDir: string): Promise<void> {
  const p = metaPath(dataDir)
  const existing = await readJsonIfExists<{ schemaVersion: number; createdAtMs: number }>(p)
  if (existing && existing.schemaVersion === 1) return
  await atomicWriteJson(p, { schemaVersion: 1, createdAtMs: Date.now() })
}

export async function ensureDataRoot(): Promise<{ dataDir: string }> {
  const dataDir = getDataDir()
  await mkdirp(dataDir)
  await mkdirp(conversationsDir(dataDir))
  await mkdirp(path.join(dataDir, 'models'))
  await ensureMetaFile(dataDir)
  return { dataDir }
}

async function readConversationMeta(dataDir: string, conversationId: string): Promise<ConversationMeta> {
  const p = conversationJsonPath(dataDir, conversationId)
  const meta = await readJsonFile<ConversationMeta>(p)
  if (!meta || meta.schemaVersion !== 1) throw new Error(`Invalid conversation meta: ${p}`)
  return meta
}

async function writeConversationMeta(dataDir: string, meta: ConversationMeta): Promise<void> {
  await atomicWriteJson(conversationJsonPath(dataDir, meta.id), meta)
}

async function touchConversationUpdatedAt(dataDir: string, conversationId: string, updatedAtMs: number): Promise<void> {
  const meta = await readConversationMeta(dataDir, conversationId)
  if (meta.updatedAtMs === updatedAtMs) return
  await writeConversationMeta(dataDir, { ...meta, updatedAtMs })
}

export async function createConversation(): Promise<string> {
  const { dataDir } = await ensureDataRoot()
  const id = crypto.randomUUID()
  const now = Date.now()
  const meta: ConversationMeta = {
    schemaVersion: 1,
    id,
    summary: null,
    status: 'active',
    createdAtMs: now,
    updatedAtMs: now,
  }
  await conversationLocks.runExclusive(id, async () => {
    await mkdirp(messagesDir(dataDir, id))
    await writeConversationMeta(dataDir, meta)
  })
  return id
}

export async function listConversations(): Promise<Array<{ id: string; preview: string }>> {
  const { dataDir } = await ensureDataRoot()
  const root = conversationsDir(dataDir)
  let entries: Dirent[] = []
  try {
    entries = await fsp.readdir(root, { withFileTypes: true })
  } catch {
    return []
  }

  const metas: ConversationMeta[] = []
  for (const ent of entries) {
    if (!ent.isDirectory()) continue
    const id = ent.name
    if (!id) continue
    try {
      const meta = await readConversationMeta(dataDir, id)
      metas.push(meta)
    } catch {
      // ignore invalid entries
    }
  }

  metas.sort((a, b) => {
    const dt = (b.updatedAtMs || 0) - (a.updatedAtMs || 0)
    if (dt !== 0) return dt
    return String(b.id).localeCompare(String(a.id))
  })

  return metas.map((m) => ({
    id: m.id,
    preview: m.summary && m.summary.trim() ? String(m.summary).slice(0, 100) : 'Untitled',
  }))
}

export async function getConversationSummary(conversationIdRaw: string): Promise<{ id: string; summary: string | null }> {
  const { dataDir } = await ensureDataRoot()
  const conversationId = assertUuid(conversationIdRaw, 'conversation_id')
  const meta = await readConversationMeta(dataDir, conversationId)
  return { id: meta.id, summary: meta.summary ?? null }
}

export async function updateConversationSummary(
  conversationIdRaw: string,
  summary: string | null
): Promise<{ id: string; summary: string | null }> {
  const { dataDir } = await ensureDataRoot()
  const conversationId = assertUuid(conversationIdRaw, 'conversation_id')

  const normalized = summary == null ? null : String(summary)
  if (normalized != null && [...normalized].length > 100) {
    const err = new Error('summary must be <= 100 characters')
    ;(err as any).status = 400
    throw err
  }

  await conversationLocks.runExclusive(conversationId, async () => {
    const meta = await readConversationMeta(dataDir, conversationId)
    await writeConversationMeta(dataDir, { ...meta, summary: normalized })
  })

  return { id: conversationId, summary: normalized }
}

export async function deleteConversation(conversationIdRaw: string): Promise<void> {
  const { dataDir } = await ensureDataRoot()
  const conversationId = assertUuid(conversationIdRaw, 'conversation_id')
  await conversationLocks.runExclusive(conversationId, async () => {
    const dir = conversationDir(dataDir, conversationId)
    await fsp.rm(dir, { recursive: true, force: true })
  })
}

function normalizeRole(raw: unknown): 'system' | 'user' | 'assistant' {
  const role = String(raw || '').trim()
  if (role === 'system' || role === 'user' || role === 'assistant') return role
  const err = new Error('role must be one of: system, user, assistant')
  ;(err as any).status = 400
  throw err
}

export async function upsertMessage(
  conversationIdRaw: string,
  message: { external_id: string; parent_external_id?: string | null; role: unknown; content: unknown; model?: unknown; created_ts: unknown }
): Promise<void> {
  const { dataDir } = await ensureDataRoot()
  const conversationId = assertUuid(conversationIdRaw, 'conversation_id')

  const externalId = assertMessageId(message.external_id, 'external_id')
  const parentExternal = message.parent_external_id == null ? null : assertMessageId(message.parent_external_id, 'parent_external_id')
  const role = normalizeRole(message.role)
  const content = typeof message.content === 'string' ? message.content : message.content == null ? '' : String(message.content)
  const model = message.model == null ? null : String(message.model || '').trim() || null
  const createdTsMs = Math.max(0, Math.floor(toSafeNumber(message.created_ts, 0)))
  const now = Date.now()

  await conversationLocks.runExclusive(conversationId, async () => {
    const metaFile = conversationJsonPath(dataDir, conversationId)
    if (!(await pathExists(metaFile))) {
      const err = new Error('conversation not found')
      ;(err as any).status = 404
      throw err
    }

    const p = messageJsonPath(dataDir, conversationId, externalId)
    const existing = await readJsonIfExists<StoredMessage>(p)
    const record: StoredMessage = {
      schemaVersion: 1,
      id: externalId,
      conversationId,
      parentId: parentExternal,
      role,
      content,
      model,
      createdTsMs: existing?.createdTsMs && existing.createdTsMs > 0 ? existing.createdTsMs : createdTsMs,
      updatedAtMs: now,
    }
    await atomicWriteJson(p, record)
    await touchConversationUpdatedAt(dataDir, conversationId, now)
  })
}

export async function overwriteAssistantContent(
  conversationIdRaw: string,
  assistantExternalIdRaw: string,
  fullContent: string
): Promise<void> {
  const { dataDir } = await ensureDataRoot()
  const conversationId = assertUuid(conversationIdRaw, 'conversation_id')
  const assistantExternalId = assertMessageId(assistantExternalIdRaw, 'assistantExternalId')
  const now = Date.now()

  await conversationLocks.runExclusive(conversationId, async () => {
    const p = messageJsonPath(dataDir, conversationId, assistantExternalId)
    const existing = await readJsonIfExists<StoredMessage>(p)
    if (!existing) return
    await atomicWriteJson(p, { ...existing, content: fullContent, updatedAtMs: now })
    await touchConversationUpdatedAt(dataDir, conversationId, now)
  })
}

export async function replaceSnapshot(conversationIdRaw: string, snapshot: { nodes: any[]; rootId: string }): Promise<void> {
  const { dataDir } = await ensureDataRoot()
  const conversationId = assertUuid(conversationIdRaw, 'conversation_id')
  const now = Date.now()
  const nodesArray = Array.isArray(snapshot?.nodes) ? snapshot.nodes : []

  await conversationLocks.runExclusive(conversationId, async () => {
    const metaFile = conversationJsonPath(dataDir, conversationId)
    if (!(await pathExists(metaFile))) {
      const err = new Error('conversation not found')
      ;(err as any).status = 404
      throw err
    }

    const msgDir = messagesDir(dataDir, conversationId)
    await fsp.rm(msgDir, { recursive: true, force: true })
    await mkdirp(msgDir)

    for (const raw of nodesArray) {
      const id = assertMessageId(raw?.id, 'node.id')
      const parent = raw?.parentId == null ? null : assertMessageId(raw?.parentId, 'node.parentId')
      const role = normalizeRole(raw?.role)
      const content = typeof raw?.content === 'string' ? raw.content : raw?.content == null ? '' : String(raw.content)
      const createdTsMs = Math.max(0, Math.floor(toSafeNumber(raw?.createdAt, 0)))
      const model = raw?.model == null ? null : String(raw.model || '').trim() || null
      const record: StoredMessage = {
        schemaVersion: 1,
        id,
        conversationId,
        parentId: parent,
        role,
        content,
        model,
        createdTsMs,
        updatedAtMs: now,
      }
      await atomicWriteJson(messageJsonPath(dataDir, conversationId, id), record)
    }

    await touchConversationUpdatedAt(dataDir, conversationId, now)
  })
}

async function loadAllMessages(dataDir: string, conversationId: string): Promise<StoredMessage[]> {
  const dir = messagesDir(dataDir, conversationId)
  let entries: Dirent[] = []
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch (e: any) {
    if (e?.code === 'ENOENT') return []
    throw e
  }
  const out: StoredMessage[] = []
  for (const ent of entries) {
    if (!ent.isFile()) continue
    if (!ent.name.endsWith('.json')) continue
    const p = path.join(dir, ent.name)
    try {
      const msg = await readJsonFile<StoredMessage>(p)
      if (msg?.schemaVersion !== 1) continue
      out.push(msg)
    } catch {
      // ignore invalid files
    }
  }
  out.sort((a, b) => {
    const dt = (a.createdTsMs || 0) - (b.createdTsMs || 0)
    if (dt !== 0) return dt
    return String(a.id).localeCompare(String(b.id))
  })
  return out
}

export async function loadConversation(conversationIdRaw: string): Promise<SnapshotState> {
  const { dataDir } = await ensureDataRoot()
  const conversationId = assertUuid(conversationIdRaw, 'conversation_id')
  const metaFile = conversationJsonPath(dataDir, conversationId)
  if (!(await pathExists(metaFile))) {
    const err = new Error('not found')
    ;(err as any).status = 404
    throw err
  }

  const messages = await loadAllMessages(dataDir, conversationId)
  const nodes: Record<string, SnapshotNode> = {}
  const ids = new Set<string>()
  const parentIds = new Set<string>()

  for (const m of messages) {
    ids.add(m.id)
    if (m.parentId) parentIds.add(m.parentId)
  }

  for (const m of messages) {
    nodes[m.id] = {
      id: m.id,
      role: m.role,
      content: m.content ?? '',
      parentId: m.parentId ?? null,
      children: [],
      createdAt: m.createdTsMs || 0,
      model: m.model ?? undefined,
    }
  }

  let rootId: string | null = null
  const explicitRoots = messages.filter((m) => !m.parentId).map((m) => m.id)
  if (explicitRoots.length > 0) {
    rootId = explicitRoots[0]
  } else {
    const missingParents = [...parentIds].filter((pid) => !ids.has(pid)).sort()
    if (missingParents.length > 0) {
      const synthId = missingParents[0]
      nodes[synthId] = {
        id: synthId,
        role: 'system',
        content: 'You are a helpful assistant.',
        parentId: null,
        children: [],
        createdAt: 0,
      }
      rootId = synthId
    }
  }

  // Link children
  for (const m of messages) {
    const pid = m.parentId
    if (pid && nodes[pid]) nodes[pid].children.push(m.id)
  }

  // Fallback: break cycles / bad data
  if (!rootId && messages.length > 0) {
    rootId = messages[0].id
    nodes[rootId] = { ...nodes[rootId], parentId: null }
  }

  if (!rootId) {
    const err = new Error('empty conversation')
    ;(err as any).status = 404
    throw err
  }

  return { nodes, rootId, selectedLeafId: rootId }
}

export async function loadLatestConversation(): Promise<{ id: string; snapshot: SnapshotState }> {
  const list = await listConversations()
  if (list.length === 0) {
    const err = new Error('no conversations')
    ;(err as any).status = 404
    throw err
  }
  const id = list[0].id
  const snapshot = await loadConversation(id)
  return { id, snapshot }
}

export async function deleteMessageSubtree(conversationIdRaw: string, externalIdRaw: string): Promise<void> {
  const { dataDir } = await ensureDataRoot()
  const conversationId = assertUuid(conversationIdRaw, 'conversation_id')
  const externalId = assertMessageId(externalIdRaw, 'externalId')
  const now = Date.now()

  await conversationLocks.runExclusive(conversationId, async () => {
    const metaFile = conversationJsonPath(dataDir, conversationId)
    if (!(await pathExists(metaFile))) {
      const err = new Error('conversation not found')
      ;(err as any).status = 404
      throw err
    }

    const messages = await loadAllMessages(dataDir, conversationId)
    const byId = new Map<string, StoredMessage>()
    const children: Record<string, string[]> = {}
    for (const m of messages) {
      byId.set(m.id, m)
      if (m.parentId) {
        children[m.parentId] = children[m.parentId] || []
        children[m.parentId].push(m.id)
      }
    }
    if (!byId.has(externalId)) {
      const err = new Error('message not found')
      ;(err as any).status = 404
      throw err
    }

    const toDelete = new Set<string>()
    const stack = [externalId]
    while (stack.length) {
      const id = stack.pop()!
      if (toDelete.has(id)) continue
      toDelete.add(id)
      const kids = children[id] || []
      for (const k of kids) stack.push(k)
    }

    for (const id of toDelete) {
      await fsp.rm(messageJsonPath(dataDir, conversationId, id), { force: true })
    }
    await touchConversationUpdatedAt(dataDir, conversationId, now)
  })
}

export async function checkDataDirReadableWritable(): Promise<void> {
  const { dataDir } = await ensureDataRoot()
  await fsp.access(dataDir, FS_CONSTANTS.R_OK | FS_CONSTANTS.W_OK)
}
