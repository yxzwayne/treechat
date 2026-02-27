import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Pool } from 'pg'

import { allowedModels, defaultModel } from '../models.js'
import { atomicWriteJson, mkdirp, pathExists } from '../storage/fs-json.js'
import { assertMessageId, assertUuid } from '../storage/ids.js'
import {
  conversationsDir,
  conversationJsonPath,
  getDataDir,
  messageJsonPath,
  messagesDir,
  metaPath,
  modelConfigPath,
  modelsDir,
  openrouterCatalogPath,
} from '../storage/paths.js'

type ConversationRow = {
  uuid: string
  summary: string | null
  status: string | null
  created_at: unknown
  updated_at: unknown
}

type MessageRow = {
  conversation_id: string
  external_id: string
  role: string | null
  sender: string | null
  text: string | null
  model: string | null
  created_ts: unknown
  updated_at: unknown
  parent_external_id: string | null
}

function toMs(value: unknown, fallback = 0): number {
  if (!value) return fallback
  const dt = new Date(String(value))
  const ms = dt.getTime()
  return Number.isFinite(ms) ? ms : fallback
}

function toSafeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return fallback
}

function nowStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function normalizeRole(role: string | null, sender: string | null): 'system' | 'user' | 'assistant' {
  const raw = String(role || sender || 'assistant')
  if (raw === 'human') return 'user'
  if (raw === 'ai') return 'assistant'
  if (raw === 'system' || raw === 'user' || raw === 'assistant') return raw
  return 'assistant'
}

async function main() {
  // Note: `npm run <script> --force` applies to npm itself (and sets npm_config_force),
  // while `npm run <script> -- --force` passes `--force` through to the script.
  const force = process.argv.includes('--force') || process.env.npm_config_force === 'true'
  const dataDir = getDataDir()

  const hasConversations = await pathExists(conversationsDir(dataDir)).catch(() => false)
  const hasModels = await pathExists(modelsDir(dataDir)).catch(() => false)
  if ((hasConversations || hasModels) && !force) {
    console.error(`[migrate] Refusing to overwrite existing data dir: ${dataDir}`)
    console.error('[migrate] Re-run with `npm run migrate:pg-to-file -- --force` to back up and overwrite.')
    process.exit(2)
  }

  if (await pathExists(dataDir)) {
    if (hasConversations || hasModels) {
      const backup = `${dataDir}.bak-${nowStamp()}`
      console.log(`[migrate] Backing up existing data dir to: ${backup}`)
      await fs.rename(dataDir, backup)
    }
  }

  await mkdirp(dataDir)
  await mkdirp(conversationsDir(dataDir))
  await mkdirp(modelsDir(dataDir))
  await atomicWriteJson(metaPath(dataDir), { schemaVersion: 1, createdAtMs: Date.now() })

  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('[migrate] DATABASE_URL is required to read from Postgres.')
    console.error('[migrate] If you previously ran TreeChat with the built-in default, try:')
    console.error('[migrate]   DATABASE_URL=postgres://localhost:5432/treechat npm run migrate:pg-to-file -- --force')
    console.error('[migrate] Or set DATABASE_URL in server/.env for your local Postgres instance.')
    process.exit(2)
  }

  const pool = new Pool({ connectionString: url })
  try {
    const conversationsRes = await pool.query(
      `select uuid, summary, status, created_at, updated_at
         from conversations
        order by updated_at asc, uuid asc`
    )

    const conversations = conversationsRes.rows as ConversationRow[]
    for (const row of conversations) {
      const id = assertUuid(row.uuid, 'conversation uuid')
      const createdAtMs = toMs(row.created_at, 0)
      const updatedAtMs = toMs(row.updated_at, createdAtMs || 0)
      const meta = {
        schemaVersion: 1 as const,
        id,
        summary: row.summary == null ? null : String(row.summary),
        status: 'active' as const,
        createdAtMs,
        updatedAtMs,
      }
      await mkdirp(messagesDir(dataDir, id))
      await atomicWriteJson(conversationJsonPath(dataDir, id), meta)
    }

    const messagesRes = await pool.query(
      `select m.conversation_id,
              m.external_id,
              m.role,
              m.sender,
              m.text,
              m.model,
              m.created_ts,
              m.updated_at,
              p.external_id as parent_external_id
         from messages m
         left join messages p on p.uuid = m.parent_id
        order by m.conversation_id asc, m.created_ts asc, m.created_at asc`
    )

    const messages = messagesRes.rows as MessageRow[]
    for (const row of messages) {
      const conversationId = assertUuid(String(row.conversation_id), 'conversation_id')
      const id = assertMessageId(String(row.external_id), 'external_id')
      const parentId = row.parent_external_id == null ? null : assertMessageId(String(row.parent_external_id), 'parent_external_id')
      const role = normalizeRole(row.role, row.sender)
      const createdTsMs = Math.max(0, Math.floor(toSafeNumber(row.created_ts, 0)))
      const updatedAtMs = toMs(row.updated_at, Date.now())
      const record = {
        schemaVersion: 1 as const,
        id,
        conversationId,
        parentId,
        role,
        content: row.text == null ? '' : String(row.text),
        model: row.model == null ? null : String(row.model),
        createdTsMs,
        updatedAtMs,
      }
      await atomicWriteJson(messageJsonPath(dataDir, conversationId, id), record)
    }

    const configRes = await pool.query(`select enabled_ids, default_id, updated_at from model_config where id = 1`)
    if ((configRes.rowCount || 0) > 0) {
      const row = configRes.rows[0] as { enabled_ids: string[] | null; default_id: string | null; updated_at: unknown }
      const enabledIds = Array.isArray(row.enabled_ids) && row.enabled_ids.length > 0 ? row.enabled_ids : [...allowedModels]
      const defaultId = typeof row.default_id === 'string' && row.default_id ? row.default_id : defaultModel
      await atomicWriteJson(modelConfigPath(dataDir), {
        schemaVersion: 1,
        enabledIds,
        defaultId: enabledIds.includes(defaultId) ? defaultId : enabledIds[0],
        updatedAtMs: toMs(row.updated_at, Date.now()),
      })
    } else {
      await atomicWriteJson(modelConfigPath(dataDir), {
        schemaVersion: 1,
        enabledIds: [...allowedModels],
        defaultId: defaultModel,
        updatedAtMs: Date.now(),
      })
    }

    const stateRes = await pool.query(`select fetched_at from openrouter_model_catalog_state where id = 1`)
    const fetchedAtMs = stateRes.rowCount ? toMs((stateRes.rows[0] as { fetched_at: unknown }).fetched_at, 0) : 0

    const catalogRes = await pool.query(
      `select id, canonical_slug, name, created, description, context_length, provider
         from openrouter_model_catalog`
    )
    if ((catalogRes.rowCount || 0) > 0) {
      const models = (catalogRes.rows as any[]).map((r) => ({
        id: String(r.id),
        canonical_slug: String(r.canonical_slug || r.id),
        name: String(r.name || r.canonical_slug || r.id),
        created: Math.floor(toSafeNumber(r.created, 0)),
        description: String(r.description || ''),
        context_length: Math.floor(toSafeNumber(r.context_length, 0)),
        provider: String(r.provider || String(r.id).split('/')[0] || 'unknown'),
      }))
      await atomicWriteJson(openrouterCatalogPath(dataDir), {
        schemaVersion: 1,
        fetchedAtMs,
        models,
      })
    }

    console.log(`[migrate] Exported conversations: ${conversations.length}`)
    console.log(`[migrate] Exported messages: ${messages.length}`)
    console.log(`[migrate] Wrote data dir: ${dataDir}`)
  } finally {
    await pool.end().catch(() => {})
  }
}

main().catch((e) => {
  console.error('[migrate] Failed:', e?.message || e)
  process.exit(1)
})
