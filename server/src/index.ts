import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import type { Request, Response } from 'express'
import OpenAI from 'openai'
import { ensureSchema, getPool } from './pg'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787
const USE_MOCK = process.env.USE_MOCK === '1'

let openai: OpenAI | null = null
if (!USE_MOCK) {
  const key = process.env.OPENAI_API_KEY
  if (!key) console.warn('OPENAI_API_KEY not set. Set USE_MOCK=1 to run without network.')
  openai = new OpenAI({ apiKey: key })
}

app.get('/health', async (_req, res) => {
  try {
    const pool = getPool()
    await pool.query('select 1')
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'db error' })
  }
})

app.post('/api/chat', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Transfer-Encoding', 'chunked')

  try {
    const { model, messages, conversationId, assistantExternalId } = req.body as { model?: string, messages: { role: 'system' | 'user' | 'assistant', content: string }[], conversationId?: string, assistantExternalId?: string }
    const useModel = model || process.env.MODEL || 'gpt-5-mini'
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
    console.error(err)
    try {
      const body = (req as any).body || {}
      await logChat({ model: body?.model || process.env.MODEL || 'gpt-5-mini', messages: body?.messages || [], response: '', startedAt: Date.now(), error: err?.message || String(err) })
    } catch {}
    res.status(500).end('Server error')
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
          content: 'You are a helpful assistant.',
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
          content: 'You are a helpful assistant.',
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

ensureSchema().then(() => {
  app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`)
  })
}).catch((e) => {
  console.error('[server] failed to ensure schema', e)
  process.exit(1)
})

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
