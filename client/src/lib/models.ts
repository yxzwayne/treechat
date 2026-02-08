export type ModelsResponse = {
  models: string[]
  default: string
  labels: Record<string, string>
  updatedAt?: number
}

export type CatalogModel = {
  id: string
  canonical_slug: string
  name: string
  created: number
  description: string
  context_length: number
  provider: string
}

export type CatalogSearchResponse = {
  models: CatalogModel[]
  total: number
  providers: string[]
  stale: boolean
  fetchedAt: number
}

export type EnabledModelsDetailedResponse = {
  models: CatalogModel[]
  default: string
  updatedAt: number
  stale: boolean
  fetchedAt: number
}

function fallbackModels(): ModelsResponse {
  return {
    models: [
      'google/gemini-3-flash-preview',
      'openai/gpt-5.2-chat',
      'anthropic/claude-sonnet-4.5',
    ],
    default: 'openai/gpt-5.2-chat',
    labels: {
      'google/gemini-3-flash-preview': 'Gemini 3 Flash Preview',
      'openai/gpt-5.2-chat': 'GPT-5.2 Chat',
      'anthropic/claude-sonnet-4.5': 'Claude 4.5 Sonnet',
      'openai/gpt-5-chat': 'GPT-5 Chat',
      'openai/gpt-5-mini': 'GPT-5 Mini',
      'openai/o3': 'OpenAI O3',
      'openai/o4-mini': 'OpenAI O4 Mini',
      'google/gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
      'google/gemini-2.5-flash': 'Gemini 2.5 Flash',
      'google/gemini-2.5-pro': 'Gemini 2.5 Pro',
      'anthropic/claude-sonnet-4': 'Claude 4 Sonnet',
      'anthropic/claude-opus-4.1': 'Claude 4.1 Opus',
    },
  }
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const text = await response.text().catch(() => '')
  if (!text) return fallback
  try {
    const json = JSON.parse(text) as { error?: string }
    if (json?.error) return json.error
  } catch {
    // ignore
  }
  return text
}

export async function fetchAllowedModels(): Promise<ModelsResponse> {
  try {
    const response = await fetch('/api/models')
    if (!response.ok) throw new Error(await readErrorMessage(response, 'Failed to load models'))
    const data = await response.json() as ModelsResponse
    return {
      models: Array.isArray(data.models) ? data.models : fallbackModels().models,
      default: typeof data.default === 'string' && data.default ? data.default : fallbackModels().default,
      labels: data.labels || {},
      updatedAt: data.updatedAt,
    }
  } catch {
    return fallbackModels()
  }
}

export async function searchCatalogModels(params: {
  q?: string
  provider?: string
  limit?: number
  offset?: number
  random?: boolean
}): Promise<CatalogSearchResponse> {
  const query = new URLSearchParams()
  if (params.q) query.set('q', params.q)
  if (params.provider) query.set('provider', params.provider)
  if (typeof params.limit === 'number') query.set('limit', String(params.limit))
  if (typeof params.offset === 'number') query.set('offset', String(params.offset))
  if (params.random) query.set('random', '1')

  const response = await fetch(`/api/openrouter/models?${query.toString()}`)
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to search models'))
  }
  return response.json()
}

export async function fetchEnabledModelsDetailed(): Promise<EnabledModelsDetailedResponse> {
  const response = await fetch('/api/models/enabled')
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to load enabled models'))
  }
  return response.json()
}

export async function enableModel(id: string): Promise<EnabledModelsDetailedResponse> {
  const response = await fetch('/api/models/enabled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to enable model'))
  }
  return response.json()
}

export async function disableModel(id: string): Promise<EnabledModelsDetailedResponse> {
  const response = await fetch(`/api/models/enabled/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to disable model'))
  }
  return response.json()
}

export async function setDefaultModel(id: string): Promise<EnabledModelsDetailedResponse> {
  const response = await fetch('/api/models/default', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, 'Failed to set default model'))
  }
  return response.json()
}
