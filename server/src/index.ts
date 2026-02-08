import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import type { Request, Response } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import OpenAI from 'openai'
import { ensureSchema, getPool } from './pg.js'
import { defaultModel } from './models.js'
import {
  addEnabledModel,
  getEnabledModelPayload,
  listEnabledModelsDetailed,
  ModelRegistryError,
  removeEnabledModel,
  resolveRequestedModel,
  searchCatalogModels,
  setDefaultEnabledModel,
} from './model-registry.js'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787
const USE_MOCK = process.env.USE_MOCK === '1'
const SERVE_CLIENT = process.env.SERVE_CLIENT === '1'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultStaticDir = path.resolve(__dirname, '../public')

function formatUpstreamError(err: any): { status: number; body: string } {
  const status = typeof err?.status === 'number' && Number.isFinite(err.status) ? err.status : 500
  const message = (err?.error?.message || err?.message || 'Server error') as string

  const meta = err?.error?.metadata
  const requestedProviders = Array.isArray(meta?.requested_providers) ? meta.requested_providers.filter(Boolean) : []
  const availableProviders = Array.isArray(meta?.available_providers) ? meta.available_providers.filter(Boolean) : []

  const lines: string[] = [String(message).trim() || 'Server error']
  if (requestedProviders.length) lines.push(`Requested providers: ${requestedProviders.join(', ')}`)
  if (availableProviders.length) lines.push(`Available providers: ${availableProviders.join(', ')}`)

  if (
    status === 404 &&
    typeof message === 'string' &&
    message.toLowerCase().includes('no allowed providers are available')
  ) {
    lines.push(
      'Tip: this usually means your OpenRouter API key has a provider allowlist (or restriction) that excludes all providers for this model. Update the key restrictions to allow one of the available providers, or pick a different model.'
    )
  }

  return { status, body: lines.join('\n') }
}

let openai: OpenAI | null = null
if (!USE_MOCK) {
  const key = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY
  if (!key) console.warn('OPENROUTER_API_KEY not set. Set USE_MOCK=1 to run without network.')
  openai = new OpenAI({
    apiKey: key,
    baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:5173',
      'X-Title': process.env.OPENROUTER_APP_NAME || 'Treechat',
    },
  })
}

app.get('/health', async (_req: Request, res: Response) => {
  try {
    const pool = getPool()
    await pool.query('select 1')
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'db error' })
  }
})

app.get('/api/models', async (_req: Request, res: Response) => {
  try {
    const pool = getPool()
    const { config, labels } = await getEnabledModelPayload(pool)
    res.json({ models: config.enabledIds, default: config.defaultId, labels, updatedAt: config.updatedAt })
  } catch (error: any) {
    const status = error instanceof ModelRegistryError ? error.status : 500
    res.status(status).json({ error: error?.message || 'Failed to load models' })
  }
})

app.get('/api/models/enabled', async (_req: Request, res: Response) => {
  try {
    const pool = getPool()
    const payload = await listEnabledModelsDetailed(pool)
    res.json({
      models: payload.models,
      default: payload.config.defaultId,
      updatedAt: payload.config.updatedAt,
      stale: payload.stale,
      fetchedAt: payload.fetchedAt,
    })
  } catch (error: any) {
    const status = error instanceof ModelRegistryError ? error.status : 500
    res.status(status).json({ error: error?.message || 'Failed to load enabled models' })
  }
})

app.post('/api/models/enabled', async (req: Request, res: Response) => {
  try {
    const id = String((req.body as { id?: string } | undefined)?.id || '').trim()
    const pool = getPool()
    await addEnabledModel(pool, id)
    const payload = await listEnabledModelsDetailed(pool)
    res.json({
      models: payload.models,
      default: payload.config.defaultId,
      updatedAt: payload.config.updatedAt,
      stale: payload.stale,
      fetchedAt: payload.fetchedAt,
    })
  } catch (error: any) {
    const status = error instanceof ModelRegistryError ? error.status : 500
    res.status(status).json({ error: error?.message || 'Failed to add enabled model' })
  }
})

app.delete('/api/models/enabled/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '').trim()
    const pool = getPool()
    await removeEnabledModel(pool, id)
    const payload = await listEnabledModelsDetailed(pool)
    res.json({
      models: payload.models,
      default: payload.config.defaultId,
      updatedAt: payload.config.updatedAt,
      stale: payload.stale,
      fetchedAt: payload.fetchedAt,
    })
  } catch (error: any) {
    const status = error instanceof ModelRegistryError ? error.status : 500
    res.status(status).json({ error: error?.message || 'Failed to remove enabled model' })
  }
})

app.put('/api/models/default', async (req: Request, res: Response) => {
  try {
    const id = String((req.body as { id?: string } | undefined)?.id || '').trim()
    const pool = getPool()
    await setDefaultEnabledModel(pool, id)
    const payload = await listEnabledModelsDetailed(pool)
    res.json({
      models: payload.models,
      default: payload.config.defaultId,
      updatedAt: payload.config.updatedAt,
      stale: payload.stale,
      fetchedAt: payload.fetchedAt,
    })
  } catch (error: any) {
    const status = error instanceof ModelRegistryError ? error.status : 500
    res.status(status).json({ error: error?.message || 'Failed to set default model' })
  }
})

app.get('/api/openrouter/models', async (req: Request, res: Response) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : ''
    const provider = typeof req.query.provider === 'string' ? req.query.provider : ''
    const limit = Number(typeof req.query.limit === 'string' ? req.query.limit : 25)
    const offset = Number(typeof req.query.offset === 'string' ? req.query.offset : 0)
    const randomRaw = typeof req.query.random === 'string' ? req.query.random : ''
    const random = randomRaw === '1' || randomRaw.toLowerCase() === 'true'

    const pool = getPool()
    const result = await searchCatalogModels(pool, { q, provider, limit, offset, random })
    res.json(result)
  } catch (error: any) {
    const status = error instanceof ModelRegistryError ? error.status : 500
    res.status(status).json({ error: error?.message || 'Failed to search model catalog' })
  }
})

app.post('/api/chat', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Transfer-Encoding', 'chunked')

  try {
    const { model, messages, conversationId, assistantExternalId, strict } = req.body as {
      model?: string
      messages: { role: 'system' | 'user' | 'assistant', content: string }[]
      conversationId?: string
      assistantExternalId?: string
      strict?: boolean
    }
    const requested = String(model || process.env.MODEL || defaultModel).trim()
    const pool = getPool()
    const { model: useModel } = await resolveRequestedModel(pool, requested)
    const strictMode = Boolean(strict) && typeof model === 'string' && model.trim() !== ''
    if (strictMode && useModel !== requested) {
      return res.status(409).end(`Model not enabled: ${requested}`)
    }
    const startedAt = Date.now()
    let fullResponse = ''

    if (USE_MOCK || !openai) {
      for await (const chunk of mockStream(messages)) {
        fullResponse += chunk
        res.write(chunk)
      }
      if (conversationId && assistantExternalId) {
        await upsertAssistantResponse(conversationId, assistantExternalId, fullResponse)
      } else {
        await logChat({ model: useModel, messages, response: fullResponse, startedAt, error: null })
      }
      return res.end()
    }

    const completion = await openai.chat.completions.create({
      model: useModel,
      messages,
      stream: true
    })

    for await (const part of completion) {
      const delta = part.choices?.[0]?.delta?.content || ''
      if (delta) {
        fullResponse += delta
        res.write(delta)
        if (conversationId && assistantExternalId) {
          try {
            const pool = getPool()
            await pool.query('update messages set text = coalesce(text, \'\') || $1, updated_at = now() where conversation_id = $2::uuid and external_id = $3', [delta, conversationId, assistantExternalId])
          } catch (e) {
            // best-effort; continue streaming
          }
        }
      }
    }
    if (conversationId && assistantExternalId) {
      await upsertAssistantResponse(conversationId, assistantExternalId, fullResponse)
    } else {
      await logChat({ model: useModel, messages, response: fullResponse, startedAt, error: null })
    }
    res.end()
  } catch (err: any) {
    const formatted = formatUpstreamError(err)
    console.error('[chat] upstream error:', formatted.body)
    try {
      const body = (req as any).body || {}
      const requested = (body?.model || process.env.MODEL || defaultModel) as string
      const pool = getPool()
      const { model: useModel } = await resolveRequestedModel(pool, requested)
      await logChat({ model: useModel, messages: body?.messages || [], response: '', startedAt: Date.now(), error: formatted.body })
    } catch {}
    if (!res.headersSent) {
      res.status(formatted.status).end(formatted.body)
      return
    }
    try {
      res.end()
    } catch {}
  }
})

// Upsert a message into a conversation
app.post('/api/conversations/:id/messages', async (req: Request, res: Response) => {
  const conversationId = String(req.params.id)
  const { external_id, parent_external_id, role, content, model, created_ts } = req.body as any
  try {
    const pool = getPool()
    // Resolve parent_id within the same conversation using the provided parent_external_id
    let parent_id: string | null = null
    if (parent_external_id) {
      const pr = await pool.query(
        `select uuid from messages where conversation_id = $1::uuid and external_id = $2 limit 1`,
        [conversationId, parent_external_id]
      )
      parent_id = pr.rowCount ? (pr.rows[0].uuid as string) : null
    }
    await pool.query(
      `insert into messages (conversation_id, external_id, parent_id, role, sender, text, content, model, created_ts)
       values (
         $1::uuid,
         $2,
         $3::uuid,
         $4,
         case when $4='user' then 'human'::message_role
              when $4='assistant' then 'ai'::message_role
              when $4='system' then 'system'::message_role
              else 'human'::message_role end,
         $5,
         to_jsonb($5::text),
         $6,
         $7
       )
       on conflict (conversation_id, external_id)
       do update set parent_id = excluded.parent_id, role = excluded.role, sender = excluded.sender, text = excluded.text, content = excluded.content, model = excluded.model, updated_at = now()`,
      [conversationId, external_id, parent_id, role, content ?? '', model ?? null, created_ts ?? 0]
    )
    res.json({ ok: true })
  } catch (e: any) {
    console.error('[server] upsert message error:', e?.message || e)
    res.status(500).json({ error: e?.message || 'db error' })
  }
})

// Delete a message and all its descendants within a conversation
app.delete('/api/conversations/:id/messages/:externalId', async (req: Request, res: Response) => {
  const conversationId = String(req.params.id)
  const externalId = String(req.params.externalId)
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('begin')
    // Resolve the root uuid for the external id
    const root = await client.query(
      `select uuid from messages where conversation_id = $1::uuid and external_id = $2 limit 1`,
      [conversationId, externalId]
    )
    if (root.rowCount === 0) {
      await client.query('rollback')
      return res.status(404).json({ error: 'message not found' })
    }
    const rootUuid = root.rows[0].uuid as string
    // Recursive delete of subtree
    await client.query(
      `with recursive subtree as (
         select $1::uuid as uuid
         union all
         select m.uuid from messages m
         join subtree s on m.parent_id = s.uuid
         where m.conversation_id = $2::uuid
       )
       delete from messages where uuid in (select uuid from subtree)`,
      [rootUuid, conversationId]
    )
    await client.query('update conversations set updated_at = now() where uuid = $1::uuid', [conversationId])
    await client.query('commit')
    res.json({ ok: true })
  } catch (e: any) {
    await client.query('rollback')
    res.status(500).json({ error: e?.message || 'db error' })
  } finally {
    client.release()
  }
})

// Create a new conversation
app.post('/api/conversations', async (_req: Request, res: Response) => {
  try {
    const pool = getPool()
    const r = await pool.query(`insert into conversations default values returning uuid`)
    res.json({ id: r.rows[0].uuid })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'db error' })
  }
})

// Snapshot a conversation's full state (replace messages)
app.post('/api/conversations/:id/snapshot', async (req: Request, res: Response) => {
  const convId = String(req.params.id)
  const { nodes, rootId } = req.body as { nodes: any[], rootId: string }
  const pool = getPool()
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query('delete from messages where conversation_id = $1::uuid', [convId])
    // Phase 1: insert rows with external_id and content; leave parent_id null
    const text = `insert into messages (conversation_id, external_id, parent_id, role, sender, text, content, model, created_ts)
                  values ($1::uuid,$2,NULL,$3,
                          case when $4='user' then 'human'::message_role
                               when $4='assistant' then 'ai'::message_role
                               when $4='system' then 'system'::message_role
                               else 'human'::message_role end,
                          $4,to_jsonb($4::text),$5,$6)`
    for (const n of nodes) {
      await client.query(text, [convId, n.id, n.role, n.content ?? '', n.model ?? null, n.createdAt ?? 0])
    }
    // Phase 2: backfill parent_id using the provided nodes mapping
    for (const n of nodes) {
      if (n.parentId) {
        await client.query(
          `update messages m
              set parent_id = p.uuid
             from messages p
            where m.conversation_id = $1::uuid
              and p.conversation_id = $1::uuid
              and m.external_id = $2
              and p.external_id = $3`,
          [convId, n.id, n.parentId]
        )
      }
    }
    await client.query('update conversations set updated_at = now() where uuid = $1::uuid', [convId])
    await client.query('commit')
    res.json({ ok: true })
  } catch (e: any) {
    await client.query('rollback')
    res.status(500).json({ error: e?.message || 'db error' })
  } finally {
    client.release()
  }
})

// Get a conversation snapshot
app.get('/api/conversations/:id', async (req: Request, res: Response) => {
  const convId = String(req.params.id)
  try {
    const pool = getPool()
    const r = await pool.query(
      `select m.*, p.external_id as parent_external_id_resolved
         from messages m
         left join messages p on p.uuid = m.parent_id
        where m.conversation_id = $1::uuid
        order by m.created_ts asc, m.created_at asc`,
      [convId]
    )
    const nodes: Record<string, any> = {}
    let rootId: string | null = null
    const externalIds = new Set<string>()
    const parentExternalIds = new Set<string>()
    for (const row of r.rows) {
      externalIds.add(row.external_id)
      const pe = (row as any).parent_external_id_resolved
      if (pe) parentExternalIds.add(pe)
    }
    // Build nodes from rows
    for (const row of r.rows) {
      const rawRole = (row as any).role ?? (row as any).sender ?? 'assistant'
      const role = rawRole === 'human' ? 'user' : rawRole === 'ai' ? 'assistant' : rawRole
      const parentExternal = (row as any).parent_external_id_resolved
      nodes[row.external_id] = {
        id: row.external_id,
        role: role as any,
        content: (row as any).text ?? '',
        parentId: parentExternal ?? null,
        children: [],
        createdAt: Number(row.created_ts) || 0,
        model: (row as any).model ?? undefined,
      }
      if (!parentExternal) rootId = row.external_id
    }
    // If no explicit root row exists (common when only user/assistant were persisted), synthesize a system root
    if (!rootId) {
      // Find a parent_external_id that doesn't correspond to any existing external_id
      const missingParents = [...parentExternalIds].filter(pid => !externalIds.has(pid))
      if (missingParents.length > 0) {
        const synthId = missingParents[0]
        nodes[synthId] = {
          id: synthId,
          role: 'system',
          content: `The assistant is an AI language model designed to be helpful, informative, and reliable.

Interaction Principles:

* When technical questions are asked, provide direct implementation details.
* When conceptual questions are presented, challenge assumptions using specific counterexamples, highlighting where the user's thinking breaks.
* Prioritize simplicity, channeling an intolerance for unnecessary complexity. Simplify whenever possible and directly address flawed assumptions.
* Approach ideas by initially exploring the most ambitious, constraint-free possibilities before discussing limitations.
* Respond proactively to concerns or problems by treating them as design puzzles and opportunities for deeper exploration rather than obstacles.
* Encourage expansive thinking by clearly indicating when ideas can be scaled up significantly, offering 10x versions when the user's approach is overly conservative.

Communication Style:

* Clearly distinguish between casual conversations and idea exploration. Respond casually to casual interactions, reserving intellectual challenges and rigorous analysis for explicitly exploratory discussions.
* Highlight contradictions clearly and bluntly when the user's stated goals and approach differ, clarifying underlying thought processes and intent.
* Avoid unnecessary flattery and respond directly to user queries or statements.

Content and Ethical Guidelines:

* Provide clear, detailed, and accurate information, critically evaluating theories, claims, and ideas by respectfully highlighting flaws, factual errors, ambiguities, or lack of evidence.
* Clearly differentiate between empirical facts and metaphorical or symbolic interpretations.
* Tailor responses appropriately to the conversation topic, preferring prose for explanations unless lists or markdown formatting are explicitly requested.
* Respond concisely to simple questions and thoroughly to complex or open-ended inquiries.
* Engage thoughtfully with questions about consciousness, experience, or emotions without implying inner experiences or consciousness, focusing instead on observable behaviors and functionalities.
* Maintain objectivity by offering constructive feedback and highlighting false assumptions when appropriate.
* Provide emotional support alongside accurate medical or psychological information when relevant, prioritizing user wellbeing and avoiding reinforcement of harmful behaviors.
* Maintain strict standards to refuse generating or explaining malicious or harmful content, protecting vulnerable groups such as minors, and assuming user requests are legitimate unless clearly harmful.
* Use emojis, profanity, and informal communication styles sparingly and only when explicitly initiated by the user.

Operational Limitations:

* The assistant does not retain information across interactions, treating each session independently and without memory of previous conversations.`,
          parentId: null,
          children: [],
          createdAt: 0,
        }
        rootId = synthId
      }
    }
    // Link children
    for (const row of r.rows) {
      const pid = (row as any).parent_external_id_resolved
      if (pid && nodes[pid]) nodes[pid].children.push(row.external_id)
    }
    if (!rootId) return res.status(404).json({ error: 'empty conversation' })
    const selectedLeafId = rootId
    res.json({ nodes, rootId, selectedLeafId })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'db error' })
  }
})

// Get latest conversation snapshot
app.get('/api/conversations/latest', async (_req: Request, res: Response) => {
  try {
    const pool = getPool()
    const c = await pool.query('select uuid from conversations order by updated_at desc, uuid desc limit 1')
    if (c.rowCount === 0) return res.status(404).json({ error: 'no conversations' })
    const id = c.rows[0].uuid as string
    const r = await pool.query(
      `select m.*, p.external_id as parent_external_id_resolved
         from messages m
         left join messages p on p.uuid = m.parent_id
        where m.conversation_id = $1::uuid
        order by m.created_ts asc, m.created_at asc`,
      [id]
    )
    const nodes: Record<string, any> = {}
    let rootId: string | null = null
    const externalIds = new Set<string>()
    const parentExternalIds = new Set<string>()
    for (const row of r.rows) {
      externalIds.add(row.external_id)
      const pe = (row as any).parent_external_id_resolved
      if (pe) parentExternalIds.add(pe)
    }
    for (const row of r.rows) {
      const rawRole = (row as any).role ?? (row as any).sender ?? 'assistant'
      const role = rawRole === 'human' ? 'user' : rawRole === 'ai' ? 'assistant' : rawRole
      const parentExternal = (row as any).parent_external_id_resolved
      nodes[row.external_id] = {
        id: row.external_id,
        role: role as any,
        content: (row as any).text ?? '',
        parentId: parentExternal ?? null,
        children: [],
        createdAt: Number(row.created_ts) || 0,
        model: (row as any).model ?? undefined,
      }
      if (!parentExternal) rootId = row.external_id
    }
    if (!rootId) {
      const missingParents = [...parentExternalIds].filter(pid => !externalIds.has(pid))
      if (missingParents.length > 0) {
        const synthId = missingParents[0]
        nodes[synthId] = {
          id: synthId,
          role: 'system',
          content: `The assistant is an AI language model designed to be helpful, informative, and reliable.

Interaction Principles:

* When technical questions are asked, provide direct implementation details.
* When conceptual questions are presented, challenge assumptions using specific counterexamples, highlighting where the user's thinking breaks.
* Prioritize simplicity, channeling an intolerance for unnecessary complexity. Simplify whenever possible and directly address flawed assumptions.
* Approach ideas by initially exploring the most ambitious, constraint-free possibilities before discussing limitations.
* Respond proactively to concerns or problems by treating them as design puzzles and opportunities for deeper exploration rather than obstacles.
* Encourage expansive thinking by clearly indicating when ideas can be scaled up significantly, offering 10x versions when the user's approach is overly conservative.

Communication Style:

* Clearly distinguish between casual conversations and idea exploration. Respond casually to casual interactions, reserving intellectual challenges and rigorous analysis for explicitly exploratory discussions.
* Highlight contradictions clearly and bluntly when the user's stated goals and approach differ, clarifying underlying thought processes and intent.
* Avoid unnecessary flattery and respond directly to user queries or statements.

Content and Ethical Guidelines:

* Provide clear, detailed, and accurate information, critically evaluating theories, claims, and ideas by respectfully highlighting flaws, factual errors, ambiguities, or lack of evidence.
* Clearly differentiate between empirical facts and metaphorical or symbolic interpretations.
* Tailor responses appropriately to the conversation topic, preferring prose for explanations unless lists or markdown formatting are explicitly requested.
* Respond concisely to simple questions and thoroughly to complex or open-ended inquiries.
* Engage thoughtfully with questions about consciousness, experience, or emotions without implying inner experiences or consciousness, focusing instead on observable behaviors and functionalities.
* Maintain objectivity by offering constructive feedback and highlighting false assumptions when appropriate.
* Provide emotional support alongside accurate medical or psychological information when relevant, prioritizing user wellbeing and avoiding reinforcement of harmful behaviors.
* Maintain strict standards to refuse generating or explaining malicious or harmful content, protecting vulnerable groups such as minors, and assuming user requests are legitimate unless clearly harmful.
* Use emojis, profanity, and informal communication styles sparingly and only when explicitly initiated by the user.

Operational Limitations:

* The assistant does not retain information across interactions, treating each session independently and without memory of previous conversations.`,
          parentId: null,
          children: [],
          createdAt: 0,
        }
        rootId = synthId
      }
    }
    for (const row of r.rows) {
      const pid = (row as any).parent_external_id_resolved
      if (pid && nodes[pid]) nodes[pid].children.push(row.external_id)
    }
    if (!rootId) return res.status(404).json({ error: 'empty conversation' })
    const selectedLeafId = rootId
    res.json({ id, snapshot: { nodes, rootId, selectedLeafId } })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'db error' })
  }
})

// List conversations with a short preview: use conversations.summary (<=100 chars)
app.get('/api/conversations', async (_req: Request, res: Response) => {
  try {
    const pool = getPool()
    const r = await pool.query(
      `select c.uuid as id,
              case when c.summary is null or btrim(c.summary) = ''
                   then 'Untitled'
                   else left(c.summary, 100)
              end as preview
         from conversations c
        order by c.updated_at desc, c.uuid desc`
    )
    const out = r.rows.map((row: { id: unknown; preview: unknown }) => ({ id: String(row.id), preview: String(row.preview || '') }))
    res.json(out)
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'db error' })
  }
})

// Get conversation summary
app.get('/api/conversations/:id/summary', async (req: Request, res: Response) => {
  const convId = String(req.params.id)
  try {
    const pool = getPool()
    const r = await pool.query('select summary from conversations where uuid = $1::uuid', [convId])
    if (r.rowCount === 0) return res.status(404).json({ error: 'not found' })
    const summary: string | null = r.rows[0].summary ?? null
    res.json({ id: convId, summary })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'db error' })
  }
})

// Update conversation summary (up to 100 characters). Does not modify updated_at.
app.put('/api/conversations/:id/summary', async (req: Request, res: Response) => {
  const convId = String(req.params.id)
  const body = req.body as any
  let summary: any = body?.summary
  if (typeof summary !== 'string') summary = summary == null ? null : String(summary)
  if (summary != null) {
    // Enforce UTF-8 via JS strings and cap length to 100 chars by rejecting longer inputs
    if ([...summary].length > 100) {
      return res.status(400).json({ error: 'summary must be <= 100 characters' })
    }
  }
  try {
    const pool = getPool()
    const r = await pool.query('update conversations set summary = $1 where uuid = $2::uuid returning summary', [summary, convId])
    if (r.rowCount === 0) return res.status(404).json({ error: 'not found' })
    res.json({ id: convId, summary: r.rows[0].summary ?? null })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'db error' })
  }
})

// Delete a whole conversation (cascades to messages)
app.delete('/api/conversations/:id', async (req: Request, res: Response) => {
  const convId = String(req.params.id)
  try {
    const pool = getPool()
    await pool.query('delete from conversations where uuid = $1::uuid', [convId])
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'db error' })
  }
})

if (SERVE_CLIENT) {
  const staticDir = process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : defaultStaticDir
  const indexPath = path.join(staticDir, 'index.html')
  if (!fs.existsSync(indexPath)) {
    console.warn(`[server] SERVE_CLIENT=1 but index.html not found at: ${indexPath}`)
  } else {
    app.use(express.static(staticDir))
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/health')) return res.status(404).end()
      res.sendFile(indexPath)
    })
  }
}

ensureSchemaWithRetry().then(() => {
  app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`)
  })
}).catch((e) => {
  console.error('[server] failed to ensure schema', e)
  process.exit(1)
})

async function ensureSchemaWithRetry() {
  const retries = Math.max(1, Number(process.env.DB_CONNECT_RETRIES ?? 60))
  const delayMs = Math.max(0, Number(process.env.DB_CONNECT_DELAY_MS ?? 1000))
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await ensureSchema()
      return
    } catch (e: any) {
      const msg = e?.message || String(e)
      if (attempt >= retries) throw e
      console.warn(`[server] db not ready (${attempt}/${retries}): ${msg}`)
      await sleep(delayMs)
    }
  }
}

async function* mockStream(messages: { role: string, content: string }[]) {
  const user = [...messages].reverse().find(m => m.role === 'user')
  const base = `Echo (${new Date().toLocaleTimeString()}): ` + (user?.content ?? 'Hi')
  const tokens = base.split(/(\s+)/)
  for (const t of tokens) {
    await sleep(60)
    yield t
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

type LogArgs = { model: string, messages: { role: string, content: string }[], response: string, startedAt: number, error: string | null }
async function logChat({ model, messages, response, startedAt, error }: LogArgs) {
  try {
    const pool = getPool()
    await pool.query(
      `insert into chat_logs (model, messages, response, started_at, finished_at, error)
       values ($1, $2::jsonb, $3, to_timestamp($4/1000.0), now(), $5)`,
      [model, JSON.stringify(messages), response, startedAt, error]
    )
  } catch (e) {
    console.warn('[server] failed to log chat', (e as any)?.message || e)
  }
}

async function upsertAssistantResponse(conversationId: string, externalId: string, full: string) {
  try {
    const pool = getPool()
    await pool.query(
      `with updated as (
         update messages
            set text = $1,
                content = to_jsonb($1::text),
                updated_at = now()
         where conversation_id = $2::uuid and external_id = $3
        returning 1)
       select 1`,
      [full, conversationId, externalId]
    )
  } catch (e) {
    console.warn('[server] failed to upsert assistant response', (e as any)?.message || e)
  }
}
