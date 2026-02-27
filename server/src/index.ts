import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import type { Request, Response } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import OpenAI from 'openai'

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

import {
  checkDataDirReadableWritable,
  createConversation,
  deleteConversation,
  deleteMessageSubtree,
  ensureDataRoot,
  getConversationSummary,
  listConversations,
  loadConversation,
  loadLatestConversation,
  overwriteAssistantContent,
  replaceSnapshot,
  updateConversationSummary,
  upsertMessage,
} from './conversations-store.js'

const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787
const hasApiKey = Boolean((process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || '').trim())
const USE_MOCK = process.env.USE_MOCK === '1' || (!process.env.USE_MOCK && !hasApiKey)
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

function sendError(res: Response, error: any, fallback: string) {
  const status = typeof error?.status === 'number' ? error.status : 500
  const msg = error?.message || fallback
  res.status(status).json({ error: msg })
}

class ThrottledAssistantWriter {
  private readonly flushMs: number
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly content = new Map<string, string>()
  private readonly inFlight = new Map<string, Promise<void>>()

  constructor(flushMs: number) {
    this.flushMs = flushMs
  }

  append(conversationId: string, assistantExternalId: string, delta: string) {
    if (!delta) return
    const key = `${conversationId}:${assistantExternalId}`
    this.content.set(key, (this.content.get(key) || '') + delta)
    if (this.timers.has(key)) return
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key)
        void this.flush(key, conversationId, assistantExternalId)
      }, this.flushMs)
    )
  }

  async flushNow(conversationId: string, assistantExternalId: string) {
    const key = `${conversationId}:${assistantExternalId}`
    const t = this.timers.get(key)
    if (t) {
      clearTimeout(t)
      this.timers.delete(key)
    }
    await this.flush(key, conversationId, assistantExternalId)
    this.content.delete(key)
    this.inFlight.delete(key)
  }

  private async flush(key: string, conversationId: string, assistantExternalId: string) {
    const full = this.content.get(key)
    if (full == null) return
    const prev = this.inFlight.get(key) || Promise.resolve()
    const next = prev
      .catch(() => {})
      .then(async () => {
        await overwriteAssistantContent(conversationId, assistantExternalId, full)
      })
      .catch(() => {})
    this.inFlight.set(key, next)
    await next
  }
}

const assistantWriter = new ThrottledAssistantWriter(250)

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
    await checkDataDirReadableWritable()
    res.json({ ok: true })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'data dir error' })
  }
})

app.get('/api/models', async (_req: Request, res: Response) => {
  try {
    const { config, labels } = await getEnabledModelPayload()
    res.json({ models: config.enabledIds, default: config.defaultId, labels, updatedAt: config.updatedAt })
  } catch (error: any) {
    const status = error instanceof ModelRegistryError ? error.status : 500
    res.status(status).json({ error: error?.message || 'Failed to load models' })
  }
})

app.get('/api/models/enabled', async (_req: Request, res: Response) => {
  try {
    const payload = await listEnabledModelsDetailed()
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
    await addEnabledModel(id)
    const payload = await listEnabledModelsDetailed()
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
    await removeEnabledModel(id)
    const payload = await listEnabledModelsDetailed()
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
    await setDefaultEnabledModel(id)
    const payload = await listEnabledModelsDetailed()
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

    const result = await searchCatalogModels({ q, provider, limit, offset, random })
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
    const { model: useModel } = await resolveRequestedModel(requested)
    const strictMode = Boolean(strict) && typeof model === 'string' && model.trim() !== ''
    if (strictMode && useModel !== requested) {
      return res.status(409).end(`Model not enabled: ${requested}`)
    }

    let fullResponse = ''

    const onDelta = (delta: string) => {
      if (!delta) return
      fullResponse += delta
      res.write(delta)
      if (conversationId && assistantExternalId) {
        assistantWriter.append(conversationId, assistantExternalId, delta)
      }
    }

    if (USE_MOCK || !openai) {
      for await (const chunk of mockStream(messages)) onDelta(chunk)
      if (conversationId && assistantExternalId) {
        await assistantWriter.flushNow(conversationId, assistantExternalId)
      }
      return res.end()
    }

    const completion = await openai.chat.completions.create({
      model: useModel,
      messages,
      stream: true,
    })

    for await (const part of completion) {
      const delta = part.choices?.[0]?.delta?.content || ''
      if (delta) onDelta(delta)
    }
    if (conversationId && assistantExternalId) {
      await assistantWriter.flushNow(conversationId, assistantExternalId)
    }
    res.end()
  } catch (err: any) {
    const formatted = formatUpstreamError(err)
    console.error('[chat] upstream error:', formatted.body)
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
  try {
    const body = req.body as any
    await upsertMessage(conversationId, body)
    res.json({ ok: true })
  } catch (e: any) {
    console.error('[server] upsert message error:', e?.message || e)
    sendError(res, e, 'storage error')
  }
})

// Delete a message and all its descendants within a conversation
app.delete('/api/conversations/:id/messages/:externalId', async (req: Request, res: Response) => {
  const conversationId = String(req.params.id)
  const externalId = String(req.params.externalId)
  try {
    await deleteMessageSubtree(conversationId, externalId)
    res.json({ ok: true })
  } catch (e: any) {
    sendError(res, e, 'storage error')
  }
})

// Create a new conversation
app.post('/api/conversations', async (_req: Request, res: Response) => {
  try {
    const id = await createConversation()
    res.json({ id })
  } catch (e: any) {
    sendError(res, e, 'Failed to create conversation')
  }
})

// Snapshot a conversation's full state (replace messages)
app.post('/api/conversations/:id/snapshot', async (req: Request, res: Response) => {
  const convId = String(req.params.id)
  try {
    await replaceSnapshot(convId, req.body as any)
    res.json({ ok: true })
  } catch (e: any) {
    sendError(res, e, 'storage error')
  }
})

// Get a conversation snapshot
app.get('/api/conversations/:id', async (req: Request, res: Response) => {
  const convId = String(req.params.id)
  try {
    const snap = await loadConversation(convId)
    res.json(snap)
  } catch (e: any) {
    sendError(res, e, 'storage error')
  }
})

// Get latest conversation snapshot
app.get('/api/conversations/latest', async (_req: Request, res: Response) => {
  try {
    const latest = await loadLatestConversation()
    res.json(latest)
  } catch (e: any) {
    sendError(res, e, 'storage error')
  }
})

// List conversations with a short preview: use conversations.summary (<=100 chars)
app.get('/api/conversations', async (_req: Request, res: Response) => {
  try {
    const list = await listConversations()
    res.json(list)
  } catch (e: any) {
    sendError(res, e, 'storage error')
  }
})

// Get conversation summary
app.get('/api/conversations/:id/summary', async (req: Request, res: Response) => {
  const convId = String(req.params.id)
  try {
    const result = await getConversationSummary(convId)
    res.json(result)
  } catch (e: any) {
    sendError(res, e, 'storage error')
  }
})

// Update conversation summary (up to 100 characters). Does not modify updated_at.
app.put('/api/conversations/:id/summary', async (req: Request, res: Response) => {
  const convId = String(req.params.id)
  const body = req.body as any
  let summary: any = body?.summary
  if (typeof summary !== 'string') summary = summary == null ? null : String(summary)
  try {
    const result = await updateConversationSummary(convId, summary)
    res.json(result)
  } catch (e: any) {
    sendError(res, e, 'storage error')
  }
})

// Delete a whole conversation (cascades to messages)
app.delete('/api/conversations/:id', async (req: Request, res: Response) => {
  const convId = String(req.params.id)
  try {
    await deleteConversation(convId)
    res.json({ ok: true })
  } catch (e: any) {
    sendError(res, e, 'storage error')
  }
})

if (SERVE_CLIENT) {
  const envDir = process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : ''
  const cwdClientDist = path.resolve(process.cwd(), '../client/dist')
  const candidates = [envDir, cwdClientDist, defaultStaticDir].filter(Boolean)

  let staticDir = ''
  let indexPath = ''
  for (const dir of candidates) {
    const idx = path.join(dir, 'index.html')
    if (fs.existsSync(idx)) {
      staticDir = dir
      indexPath = idx
      break
    }
  }

  if (!staticDir || !indexPath) {
    const msg = candidates.map((d) => path.join(d, 'index.html')).join(', ')
    console.warn(`[server] SERVE_CLIENT=1 but index.html not found. Looked in: ${msg}`)
  } else {
    app.use(express.static(staticDir))
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/health')) return res.status(404).end()
      res.sendFile(indexPath)
    })
  }
}

ensureDataRoot()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[server] listening on http://localhost:${PORT}`)
    })
  })
  .catch((e) => {
    console.error('[server] failed to initialize data dir', e)
    process.exit(1)
  })

async function* mockStream(messages: { role: string; content: string }[]) {
  const user = [...messages].reverse().find((m) => m.role === 'user')
  const base = `Echo (${new Date().toLocaleTimeString()}): ` + (user?.content ?? 'Hi')
  const tokens = base.split(/(\s+)/)
  for (const t of tokens) {
    await sleep(60)
    yield t
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
