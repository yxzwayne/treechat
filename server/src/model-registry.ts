import type { Pool, PoolClient } from 'pg'
import { allowedModels, defaultModel, modelLabels } from './models.js'

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const CATALOG_TTL_MS = Number(process.env.OPENROUTER_MODELS_TTL_MS || 24 * 60 * 60 * 1000)
const REFRESH_COOLDOWN_MS = 30_000

const fallbackLabels = modelLabels as Record<string, string>

let refreshPromise: Promise<void> | null = null
let lastRefreshAttemptAt = 0

export type CatalogModel = {
  id: string
  canonical_slug: string
  name: string
  created: number
  description: string
  context_length: number
  provider: string
}

export type EnabledModelConfig = {
  enabledIds: string[]
  defaultId: string
  updatedAt: number
}

export class ModelRegistryError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function providerFromId(id: string): string {
  const provider = id.split('/')[0]
  return provider || 'unknown'
}

function stripProviderPrefixFromName(name: string): string {
  const trimmed = (name || '').trim()
  if (!trimmed) return ''
  // OpenRouter model names are commonly formatted as "Provider: Model Name".
  // Strip that prefix for display labels.
  const match = trimmed.match(/^([A-Za-z0-9][A-Za-z0-9 .&+/_-]{0,40})\s*:\s+(.+)$/)
  if (!match) return trimmed
  const candidate = match[2]?.trim()
  return candidate || trimmed
}

function dedupePreserveOrder(ids: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of ids) {
    const id = (raw || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function normalizeConfig(enabledIds: string[], requestedDefault: string): { enabledIds: string[]; defaultId: string } {
  const deduped = dedupePreserveOrder(enabledIds)
  const safeEnabled = deduped.length > 0 ? deduped : [...allowedModels]
  const defaultId = safeEnabled.includes(requestedDefault) ? requestedDefault : safeEnabled[0]
  return { enabledIds: safeEnabled, defaultId }
}

function timestampToMs(value: unknown): number {
  if (!value) return 0
  const dt = new Date(String(value))
  const ms = dt.getTime()
  return Number.isFinite(ms) ? ms : 0
}

function toSafeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return fallback
}

async function ensureModelConfigRow(pool: Pool): Promise<void> {
  await pool.query(
    `insert into model_config (id, enabled_ids, default_id, updated_at)
     values (1, $1::text[], $2, now())
     on conflict (id) do nothing`,
    [[...allowedModels], defaultModel]
  )
}

async function readModelConfig(pool: Pool): Promise<EnabledModelConfig> {
  await ensureModelConfigRow(pool)
  const r = await pool.query(
    `select enabled_ids, default_id, updated_at
       from model_config
      where id = 1`
  )
  if (r.rowCount === 0) {
    throw new ModelRegistryError(500, 'Model config is unavailable')
  }
  const row = r.rows[0] as { enabled_ids: string[] | null; default_id: string | null; updated_at: unknown }
  const normalized = normalizeConfig(row.enabled_ids || [], row.default_id || defaultModel)
  const currentEnabled = row.enabled_ids || []
  const currentDefault = row.default_id || ''
  if (
    currentEnabled.length !== normalized.enabledIds.length ||
    currentEnabled.some((value, idx) => value !== normalized.enabledIds[idx]) ||
    currentDefault !== normalized.defaultId
  ) {
    await pool.query(
      `update model_config
          set enabled_ids = $1::text[],
              default_id = $2,
              updated_at = now()
        where id = 1`,
      [normalized.enabledIds, normalized.defaultId]
    )
  }
  return {
    enabledIds: normalized.enabledIds,
    defaultId: normalized.defaultId,
    updatedAt: timestampToMs(row.updated_at) || Date.now(),
  }
}

async function lockModelConfig(client: PoolClient): Promise<EnabledModelConfig> {
  await client.query(
    `insert into model_config (id, enabled_ids, default_id, updated_at)
     values (1, $1::text[], $2, now())
     on conflict (id) do nothing`,
    [[...allowedModels], defaultModel]
  )

  const r = await client.query(
    `select enabled_ids, default_id, updated_at
       from model_config
      where id = 1
      for update`
  )
  if (r.rowCount === 0) {
    throw new ModelRegistryError(500, 'Model config lock failed')
  }
  const row = r.rows[0] as { enabled_ids: string[] | null; default_id: string | null; updated_at: unknown }
  const normalized = normalizeConfig(row.enabled_ids || [], row.default_id || defaultModel)
  return {
    enabledIds: normalized.enabledIds,
    defaultId: normalized.defaultId,
    updatedAt: timestampToMs(row.updated_at) || Date.now(),
  }
}

async function writeModelConfig(client: PoolClient, config: EnabledModelConfig): Promise<EnabledModelConfig> {
  const normalized = normalizeConfig(config.enabledIds, config.defaultId)
  const r = await client.query(
    `update model_config
        set enabled_ids = $1::text[],
            default_id = $2,
            updated_at = now()
      where id = 1
      returning updated_at`,
    [normalized.enabledIds, normalized.defaultId]
  )
  const updatedAt = r.rowCount ? timestampToMs((r.rows[0] as { updated_at: unknown }).updated_at) : Date.now()
  return {
    enabledIds: normalized.enabledIds,
    defaultId: normalized.defaultId,
    updatedAt: updatedAt || Date.now(),
  }
}

function isCatalogStale(fetchedAtMs: number): boolean {
  if (!fetchedAtMs) return true
  return Date.now() - fetchedAtMs > CATALOG_TTL_MS
}

async function readCatalogMeta(pool: Pool): Promise<{ count: number; fetchedAtMs: number }> {
  const [countRes, stateRes] = await Promise.all([
    pool.query(`select count(*)::int as count from openrouter_model_catalog`),
    pool.query(`select fetched_at from openrouter_model_catalog_state where id = 1`),
  ])
  const count = toSafeNumber((countRes.rows[0] as { count: unknown } | undefined)?.count, 0)
  const fetchedAtMs = stateRes.rowCount ? timestampToMs((stateRes.rows[0] as { fetched_at: unknown }).fetched_at) : 0
  return { count, fetchedAtMs }
}

function normalizeCatalogModel(raw: any): CatalogModel | null {
  const id = typeof raw?.id === 'string' ? raw.id.trim() : ''
  if (!id) return null
  const canonicalSlug = typeof raw?.canonical_slug === 'string' && raw.canonical_slug.trim() ? raw.canonical_slug : id
  const name = typeof raw?.name === 'string' && raw.name.trim() ? raw.name : canonicalSlug
  const created = Math.floor(toSafeNumber(raw?.created, 0))
  const description = typeof raw?.description === 'string' ? raw.description : ''
  const contextLength = Math.floor(toSafeNumber(raw?.context_length, toSafeNumber(raw?.top_provider?.context_length, 0)))
  return {
    id,
    canonical_slug: canonicalSlug,
    name,
    created,
    description,
    context_length: contextLength,
    provider: providerFromId(id),
  }
}

async function fetchCatalogFromOpenRouter(): Promise<CatalogModel[]> {
  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: {
      Accept: 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`OpenRouter catalog request failed (${response.status})`)
  }

  const payload = await response.json() as any
  const list = Array.isArray(payload?.data) ? payload.data : []
  const byId = new Map<string, CatalogModel>()
  for (const item of list) {
    const normalized = normalizeCatalogModel(item)
    if (!normalized) continue
    byId.set(normalized.id, normalized)
  }
  const models = [...byId.values()]
  if (models.length === 0) {
    throw new Error('OpenRouter catalog returned no models')
  }
  return models
}

async function refreshCatalog(pool: Pool): Promise<void> {
  const fetched = await fetchCatalogFromOpenRouter()
  const payload = JSON.stringify(fetched)
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(
      `insert into openrouter_model_catalog (
         id, canonical_slug, name, created, description, context_length, provider, updated_at
       )
       select x.id, x.canonical_slug, x.name, x.created, x.description, x.context_length, x.provider, now()
         from jsonb_to_recordset($1::jsonb) as x(
           id text,
           canonical_slug text,
           name text,
           created bigint,
           description text,
           context_length integer,
           provider text
         )
       on conflict (id) do update
         set canonical_slug = excluded.canonical_slug,
             name = excluded.name,
             created = excluded.created,
             description = excluded.description,
             context_length = excluded.context_length,
             provider = excluded.provider,
             updated_at = now()`,
      [payload]
    )

    await client.query(
      `delete from openrouter_model_catalog c
        where not exists (
          select 1
            from jsonb_to_recordset($1::jsonb) as x(id text)
           where x.id = c.id
        )`,
      [payload]
    )

    await client.query(
      `insert into openrouter_model_catalog_state (id, fetched_at)
       values (1, now())
       on conflict (id) do update
         set fetched_at = excluded.fetched_at`
    )
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

function maybeStartCatalogRefresh(pool: Pool, force = false): Promise<void> | null {
  if (refreshPromise) return refreshPromise
  const now = Date.now()
  if (!force && now - lastRefreshAttemptAt < REFRESH_COOLDOWN_MS) return null
  lastRefreshAttemptAt = now
  refreshPromise = refreshCatalog(pool)
    .catch((error: unknown) => {
      throw error
    })
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}

async function ensureCatalogAvailable(pool: Pool): Promise<{ stale: boolean; fetchedAt: number }> {
  const initial = await readCatalogMeta(pool)
  if (!isCatalogStale(initial.fetchedAtMs)) {
    return { stale: false, fetchedAt: initial.fetchedAtMs }
  }

  const refresh = maybeStartCatalogRefresh(pool)
  if (initial.count === 0) {
    if (refresh) {
      await refresh
    } else if (refreshPromise) {
      await refreshPromise
    } else {
      const forced = maybeStartCatalogRefresh(pool, true)
      if (forced) await forced
    }
  } else if (refresh) {
    refresh.catch(() => {
      // best effort refresh when we already have cached data
    })
  }

  const after = await readCatalogMeta(pool)
  if (after.count === 0) {
    throw new ModelRegistryError(503, 'OpenRouter model catalog is unavailable')
  }
  return { stale: isCatalogStale(after.fetchedAtMs), fetchedAt: after.fetchedAtMs }
}

export async function listEnabledModels(pool: Pool): Promise<EnabledModelConfig> {
  return readModelConfig(pool)
}

export async function getEnabledModelPayload(pool: Pool): Promise<{ config: EnabledModelConfig; labels: Record<string, string> }> {
  const config = await readModelConfig(pool)
  await ensureCatalogAvailable(pool).catch(() => {
    // Keep `/api/models` resilient when OpenRouter is temporarily unavailable.
  })
  const names = await pool.query(
    `select id, name
       from openrouter_model_catalog
      where id = any($1::text[])`,
    [config.enabledIds]
  )
  const labels: Record<string, string> = {}
  for (const id of config.enabledIds) {
    labels[id] = fallbackLabels[id] || id
  }
  for (const row of names.rows as Array<{ id: string; name: string }>) {
    const display = stripProviderPrefixFromName(row.name)
    labels[row.id] = display || labels[row.id] || row.id
  }
  return { config, labels }
}

export async function listEnabledModelsDetailed(pool: Pool): Promise<{ config: EnabledModelConfig; models: CatalogModel[]; stale: boolean; fetchedAt: number }> {
  const config = await readModelConfig(pool)
  const catalog = await ensureCatalogAvailable(pool).catch(() => ({ stale: true, fetchedAt: 0 }))
  const r = await pool.query(
    `select id, canonical_slug, name, created, description, context_length, provider
       from openrouter_model_catalog
      where id = any($1::text[])`,
    [config.enabledIds]
  )
  const byId = new Map<string, CatalogModel>()
  for (const row of r.rows as Array<{ id: string; canonical_slug: string; name: string; created: unknown; description: string; context_length: unknown; provider: string }>) {
    byId.set(row.id, {
      id: row.id,
      canonical_slug: row.canonical_slug,
      name: stripProviderPrefixFromName(row.name) || row.name,
      created: Math.floor(toSafeNumber(row.created, 0)),
      description: row.description || '',
      context_length: Math.floor(toSafeNumber(row.context_length, 0)),
      provider: row.provider || providerFromId(row.id),
    })
  }
  const models = config.enabledIds.map((id) => {
    const hit = byId.get(id)
    if (hit) return hit
    return {
      id,
      canonical_slug: id,
      name: fallbackLabels[id] || id,
      created: 0,
      description: '',
      context_length: 0,
      provider: providerFromId(id),
    }
  })
  return { config, models, stale: catalog.stale, fetchedAt: catalog.fetchedAt }
}

export async function searchCatalogModels(
  pool: Pool,
  params: { q?: string; provider?: string; limit?: number; offset?: number; random?: boolean }
): Promise<{ models: CatalogModel[]; total: number; providers: string[]; stale: boolean; fetchedAt: number }> {
  const catalog = await ensureCatalogAvailable(pool)
  const q = (params.q || '').trim().toLowerCase()
  const provider = (params.provider || '').trim().toLowerCase()
  const limit = Math.min(100, Math.max(1, Math.floor(params.limit || 25)))
  const offset = Math.max(0, Math.floor(params.offset || 0))
  const random = Boolean(params.random)

  const whereParts: string[] = []
  const values: Array<string | number> = []

  if (provider) {
    values.push(provider)
    whereParts.push(`provider = $${values.length}`)
  }
  if (q) {
    values.push(`%${q}%`)
    const key = `$${values.length}`
    whereParts.push(`(lower(name) like ${key} or lower(id) like ${key} or lower(canonical_slug) like ${key})`)
  }
  const whereSql = whereParts.length > 0 ? `where ${whereParts.join(' and ')}` : ''

  const totalRes = await pool.query(
    `select count(*)::int as total
       from openrouter_model_catalog
       ${whereSql}`,
    values
  )
  const total = toSafeNumber((totalRes.rows[0] as { total: unknown } | undefined)?.total, 0)

  const orderBySql = random ? 'order by random()' : 'order by provider asc, name asc'

  const rowsRes = await pool.query(
    `select id, canonical_slug, name, created, description, context_length, provider
       from openrouter_model_catalog
       ${whereSql}
      ${orderBySql}
      limit $${values.length + 1}
     offset $${values.length + 2}`,
    [...values, limit, offset]
  )

  const providersRes = await pool.query(
    `select distinct provider
       from openrouter_model_catalog
      order by provider asc`
  )

  const models = (rowsRes.rows as Array<{ id: string; canonical_slug: string; name: string; created: unknown; description: string; context_length: unknown; provider: string }>).map(
    (row) => ({
      id: row.id,
      canonical_slug: row.canonical_slug,
      name: stripProviderPrefixFromName(row.name) || row.name,
      created: Math.floor(toSafeNumber(row.created, 0)),
      description: row.description || '',
      context_length: Math.floor(toSafeNumber(row.context_length, 0)),
      provider: row.provider || providerFromId(row.id),
    })
  )

  const providers = (providersRes.rows as Array<{ provider: string }>).map((row) => row.provider)
  return {
    models,
    total,
    providers,
    stale: catalog.stale,
    fetchedAt: catalog.fetchedAt,
  }
}

export async function addEnabledModel(pool: Pool, modelId: string): Promise<EnabledModelConfig> {
  const id = modelId.trim()
  if (!id) throw new ModelRegistryError(400, 'Model id is required')

  await ensureCatalogAvailable(pool)
  const exists = await pool.query(`select 1 from openrouter_model_catalog where id = $1 limit 1`, [id])
  if (exists.rowCount === 0) {
    throw new ModelRegistryError(404, `Model not found in OpenRouter catalog: ${id}`)
  }

  const client = await pool.connect()
  try {
    await client.query('begin')
    const config = await lockModelConfig(client)
    if (config.enabledIds.includes(id)) {
      await client.query('commit')
      return config
    }
    config.enabledIds = [...config.enabledIds, id]
    const updated = await writeModelConfig(client, config)
    await client.query('commit')
    return updated
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function removeEnabledModel(pool: Pool, modelId: string): Promise<EnabledModelConfig> {
  const id = modelId.trim()
  if (!id) throw new ModelRegistryError(400, 'Model id is required')

  const client = await pool.connect()
  try {
    await client.query('begin')
    const config = await lockModelConfig(client)
    if (!config.enabledIds.includes(id)) {
      await client.query('commit')
      return config
    }
    if (config.enabledIds.length <= 1) {
      throw new ModelRegistryError(409, 'At least one model must remain enabled')
    }
    const enabledIds = config.enabledIds.filter((value) => value !== id)
    const defaultId = config.defaultId === id ? enabledIds[0] : config.defaultId
    const updated = await writeModelConfig(client, { ...config, enabledIds, defaultId })
    await client.query('commit')
    return updated
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function setDefaultEnabledModel(pool: Pool, modelId: string): Promise<EnabledModelConfig> {
  const id = modelId.trim()
  if (!id) throw new ModelRegistryError(400, 'Model id is required')

  const client = await pool.connect()
  try {
    await client.query('begin')
    const config = await lockModelConfig(client)
    if (!config.enabledIds.includes(id)) {
      throw new ModelRegistryError(400, 'Default model must be enabled first')
    }
    if (config.defaultId === id) {
      await client.query('commit')
      return config
    }
    const updated = await writeModelConfig(client, { ...config, defaultId: id })
    await client.query('commit')
    return updated
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export async function resolveRequestedModel(pool: Pool, requested: string): Promise<{ model: string; config: EnabledModelConfig }> {
  const config = await readModelConfig(pool)
  if (config.enabledIds.includes(requested)) {
    return { model: requested, config }
  }
  return { model: config.defaultId, config }
}
