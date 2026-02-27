import { allowedModels, defaultModel, modelLabels } from './models.js'
import { ensureDataRoot } from './conversations-store.js'
import { atomicWriteJson, readJsonIfExists } from './storage/fs-json.js'
import { modelConfigPath, openrouterCatalogPath } from './storage/paths.js'
import { Mutex } from './storage/mutex.js'

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models'
const CATALOG_TTL_MS = Number(process.env.OPENROUTER_MODELS_TTL_MS || 24 * 60 * 60 * 1000)
const REFRESH_COOLDOWN_MS = 30_000

const fallbackLabels = modelLabels as Record<string, string>

let refreshPromise: Promise<void> | null = null
let lastRefreshAttemptAt = 0

const modelsLock = new Mutex()

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

type StoredConfig = {
  schemaVersion: 1
  enabledIds: string[]
  defaultId: string
  updatedAtMs: number
}

type StoredCatalog = {
  schemaVersion: 1
  fetchedAtMs: number
  models: CatalogModel[]
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

function toSafeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return fallback
}

function isCatalogStale(fetchedAtMs: number): boolean {
  if (!fetchedAtMs) return true
  return Date.now() - fetchedAtMs > CATALOG_TTL_MS
}

async function ensureConfigExists(dataDir: string): Promise<void> {
  const p = modelConfigPath(dataDir)
  const existing = await readJsonIfExists<StoredConfig>(p)
  if (existing && existing.schemaVersion === 1) return
  const normalized = normalizeConfig([...allowedModels], defaultModel)
  const next: StoredConfig = {
    schemaVersion: 1,
    enabledIds: normalized.enabledIds,
    defaultId: normalized.defaultId,
    updatedAtMs: Date.now(),
  }
  await atomicWriteJson(p, next)
}

async function readModelConfigInternal(dataDir: string): Promise<EnabledModelConfig> {
  await ensureConfigExists(dataDir)
  const p = modelConfigPath(dataDir)
  const stored = await readJsonIfExists<StoredConfig>(p)
  if (!stored) throw new ModelRegistryError(500, 'Model config is unavailable')
  const normalized = normalizeConfig(Array.isArray(stored.enabledIds) ? stored.enabledIds : [], stored.defaultId || defaultModel)

  const needsWrite =
    stored.schemaVersion !== 1 ||
    stored.defaultId !== normalized.defaultId ||
    (stored.enabledIds || []).length !== normalized.enabledIds.length ||
    (stored.enabledIds || []).some((v, i) => v !== normalized.enabledIds[i])

  if (needsWrite) {
    const next: StoredConfig = {
      schemaVersion: 1,
      enabledIds: normalized.enabledIds,
      defaultId: normalized.defaultId,
      updatedAtMs: Date.now(),
    }
    await atomicWriteJson(p, next)
    return { enabledIds: next.enabledIds, defaultId: next.defaultId, updatedAt: next.updatedAtMs }
  }

  return {
    enabledIds: normalized.enabledIds,
    defaultId: normalized.defaultId,
    updatedAt: toSafeNumber(stored.updatedAtMs, Date.now()),
  }
}

async function writeModelConfigInternal(dataDir: string, config: EnabledModelConfig): Promise<EnabledModelConfig> {
  const normalized = normalizeConfig(config.enabledIds, config.defaultId)
  const next: StoredConfig = {
    schemaVersion: 1,
    enabledIds: normalized.enabledIds,
    defaultId: normalized.defaultId,
    updatedAtMs: Date.now(),
  }
  await atomicWriteJson(modelConfigPath(dataDir), next)
  return { enabledIds: next.enabledIds, defaultId: next.defaultId, updatedAt: next.updatedAtMs }
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
  const response = await fetch(OPENROUTER_MODELS_URL, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`OpenRouter catalog request failed (${response.status})`)
  const payload = (await response.json()) as any
  const list = Array.isArray(payload?.data) ? payload.data : []
  const byId = new Map<string, CatalogModel>()
  for (const item of list) {
    const normalized = normalizeCatalogModel(item)
    if (!normalized) continue
    byId.set(normalized.id, normalized)
  }
  const models = [...byId.values()]
  if (models.length === 0) throw new Error('OpenRouter catalog returned no models')
  return models
}

async function readCatalogMeta(dataDir: string): Promise<{ count: number; fetchedAtMs: number }> {
  const stored = await readJsonIfExists<StoredCatalog>(openrouterCatalogPath(dataDir))
  const count = Array.isArray(stored?.models) ? stored!.models.length : 0
  const fetchedAtMs = toSafeNumber(stored?.fetchedAtMs, 0)
  return { count, fetchedAtMs }
}

async function refreshCatalog(dataDir: string): Promise<void> {
  const fetched = await fetchCatalogFromOpenRouter()
  const next: StoredCatalog = {
    schemaVersion: 1,
    fetchedAtMs: Date.now(),
    models: fetched,
  }
  await atomicWriteJson(openrouterCatalogPath(dataDir), next)
}

function maybeStartCatalogRefresh(dataDir: string, force = false): Promise<void> | null {
  if (refreshPromise) return refreshPromise
  const now = Date.now()
  if (!force && now - lastRefreshAttemptAt < REFRESH_COOLDOWN_MS) return null
  lastRefreshAttemptAt = now
  refreshPromise = refreshCatalog(dataDir)
    .catch((error: unknown) => {
      throw error
    })
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}

async function ensureCatalogAvailable(dataDir: string): Promise<{ stale: boolean; fetchedAt: number }> {
  const initial = await readCatalogMeta(dataDir)
  if (!isCatalogStale(initial.fetchedAtMs)) {
    return { stale: false, fetchedAt: initial.fetchedAtMs }
  }

  const refresh = maybeStartCatalogRefresh(dataDir)
  if (initial.count === 0) {
    if (refresh) {
      await refresh
    } else if (refreshPromise) {
      await refreshPromise
    } else {
      const forced = maybeStartCatalogRefresh(dataDir, true)
      if (forced) await forced
    }
  } else if (refresh) {
    refresh.catch(() => {
      // best effort refresh when we already have cached data
    })
  }

  const after = await readCatalogMeta(dataDir)
  if (after.count === 0) throw new ModelRegistryError(503, 'OpenRouter model catalog is unavailable')
  return { stale: isCatalogStale(after.fetchedAtMs), fetchedAt: after.fetchedAtMs }
}

async function readCatalog(dataDir: string): Promise<StoredCatalog | null> {
  return readJsonIfExists<StoredCatalog>(openrouterCatalogPath(dataDir))
}

export async function listEnabledModels(): Promise<EnabledModelConfig> {
  const { dataDir } = await ensureDataRoot()
  return modelsLock.runExclusive(async () => readModelConfigInternal(dataDir))
}

export async function getEnabledModelPayload(): Promise<{ config: EnabledModelConfig; labels: Record<string, string> }> {
  const { dataDir } = await ensureDataRoot()
  return modelsLock.runExclusive(async () => {
    const config = await readModelConfigInternal(dataDir)
    await ensureCatalogAvailable(dataDir).catch(() => {
      // keep `/api/models` resilient when OpenRouter is temporarily unavailable
    })
    const catalog = await readCatalog(dataDir)
    const byId = new Map<string, CatalogModel>()
    for (const m of catalog?.models || []) byId.set(m.id, m)
    const labels: Record<string, string> = {}
    for (const id of config.enabledIds) labels[id] = fallbackLabels[id] || id
    for (const id of config.enabledIds) {
      const hit = byId.get(id)
      if (hit) labels[id] = stripProviderPrefixFromName(hit.name) || labels[id] || id
    }
    return { config, labels }
  })
}

export async function listEnabledModelsDetailed(): Promise<{ config: EnabledModelConfig; models: CatalogModel[]; stale: boolean; fetchedAt: number }> {
  const { dataDir } = await ensureDataRoot()
  return modelsLock.runExclusive(async () => {
    const config = await readModelConfigInternal(dataDir)
    const catalogMeta = await ensureCatalogAvailable(dataDir).catch(() => ({ stale: true, fetchedAt: 0 }))
    const catalog = await readCatalog(dataDir)
    const byId = new Map<string, CatalogModel>()
    for (const row of catalog?.models || []) {
      byId.set(row.id, {
        ...row,
        name: stripProviderPrefixFromName(row.name) || row.name,
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
    return { config, models, stale: catalogMeta.stale, fetchedAt: catalogMeta.fetchedAt }
  })
}

export async function searchCatalogModels(params: {
  q?: string
  provider?: string
  limit?: number
  offset?: number
  random?: boolean
}): Promise<{ models: CatalogModel[]; total: number; providers: string[]; stale: boolean; fetchedAt: number }> {
  const { dataDir } = await ensureDataRoot()

  const { stale, fetchedAt } = await modelsLock.runExclusive(async () => ensureCatalogAvailable(dataDir))
  const stored = await modelsLock.runExclusive(async () => readCatalog(dataDir))
  const all = stored?.models || []

  const q = (params.q || '').trim().toLowerCase()
  const provider = (params.provider || '').trim().toLowerCase()
  const limit = Math.min(100, Math.max(1, Math.floor(params.limit || 25)))
  const offset = Math.max(0, Math.floor(params.offset || 0))
  const random = Boolean(params.random)

  let rows = all
  if (provider) rows = rows.filter((m) => (m.provider || providerFromId(m.id)).toLowerCase() === provider)
  if (q) {
    rows = rows.filter((m) => {
      const name = (m.name || '').toLowerCase()
      const id = (m.id || '').toLowerCase()
      const slug = (m.canonical_slug || '').toLowerCase()
      return name.includes(q) || id.includes(q) || slug.includes(q)
    })
  }

  const providerSet = new Set<string>()
  for (const m of all) providerSet.add((m.provider || providerFromId(m.id)).toLowerCase())
  const providers = [...providerSet].sort()

  const total = rows.length
  if (random) {
    const shuffled = [...rows]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = shuffled[i]
      shuffled[i] = shuffled[j]
      shuffled[j] = tmp
    }
    rows = shuffled.slice(0, limit)
  } else {
    rows = [...rows].sort((a, b) => {
      const pa = (a.provider || providerFromId(a.id)).toLowerCase()
      const pb = (b.provider || providerFromId(b.id)).toLowerCase()
      const d1 = pa.localeCompare(pb)
      if (d1 !== 0) return d1
      return (a.name || '').localeCompare(b.name || '')
    })
    rows = rows.slice(offset, offset + limit)
  }

  const models = rows.map((m) => ({
    ...m,
    name: stripProviderPrefixFromName(m.name) || m.name,
    provider: m.provider || providerFromId(m.id),
    created: Math.floor(toSafeNumber(m.created, 0)),
    context_length: Math.floor(toSafeNumber(m.context_length, 0)),
    description: m.description || '',
    canonical_slug: m.canonical_slug || m.id,
  }))

  return { models, total, providers, stale, fetchedAt }
}

export async function addEnabledModel(modelId: string): Promise<EnabledModelConfig> {
  const id = modelId.trim()
  if (!id) throw new ModelRegistryError(400, 'Model id is required')

  const { dataDir } = await ensureDataRoot()
  return modelsLock.runExclusive(async () => {
    await ensureCatalogAvailable(dataDir)
    const catalog = await readCatalog(dataDir)
    const exists = (catalog?.models || []).some((m) => m.id === id)
    if (!exists) throw new ModelRegistryError(404, `Model not found in OpenRouter catalog: ${id}`)

    const config = await readModelConfigInternal(dataDir)
    if (config.enabledIds.includes(id)) return config
    config.enabledIds = [...config.enabledIds, id]
    return writeModelConfigInternal(dataDir, config)
  })
}

export async function removeEnabledModel(modelId: string): Promise<EnabledModelConfig> {
  const id = modelId.trim()
  if (!id) throw new ModelRegistryError(400, 'Model id is required')

  const { dataDir } = await ensureDataRoot()
  return modelsLock.runExclusive(async () => {
    const config = await readModelConfigInternal(dataDir)
    if (!config.enabledIds.includes(id)) return config
    if (config.enabledIds.length <= 1) throw new ModelRegistryError(409, 'At least one model must remain enabled')
    const enabledIds = config.enabledIds.filter((value) => value !== id)
    const defaultId = config.defaultId === id ? enabledIds[0] : config.defaultId
    return writeModelConfigInternal(dataDir, { ...config, enabledIds, defaultId })
  })
}

export async function setDefaultEnabledModel(modelId: string): Promise<EnabledModelConfig> {
  const id = modelId.trim()
  if (!id) throw new ModelRegistryError(400, 'Model id is required')

  const { dataDir } = await ensureDataRoot()
  return modelsLock.runExclusive(async () => {
    const config = await readModelConfigInternal(dataDir)
    if (!config.enabledIds.includes(id)) throw new ModelRegistryError(400, 'Default model must be enabled first')
    if (config.defaultId === id) return config
    return writeModelConfigInternal(dataDir, { ...config, defaultId: id })
  })
}

export async function resolveRequestedModel(requested: string): Promise<{ model: string; config: EnabledModelConfig }> {
  const { dataDir } = await ensureDataRoot()
  const config = await modelsLock.runExclusive(async () => readModelConfigInternal(dataDir))
  if (config.enabledIds.includes(requested)) return { model: requested, config }
  return { model: config.defaultId, config }
}

