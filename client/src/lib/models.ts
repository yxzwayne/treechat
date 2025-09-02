export type ModelsResponse = { models: string[]; default: string; labels: Record<string, string> }

export async function fetchAllowedModels(): Promise<ModelsResponse> {
  try {
    const r = await fetch('/api/models')
    if (!r.ok) throw new Error('Failed to load models')
    const data = await r.json()
    // Ensure labels exists even if server is older
    return { models: data.models, default: data.default, labels: data.labels || {} }
  } catch {
    // Fallback to baked-in list if server unavailable
    return {
      models: [
        'openai/gpt-5-chat',
        'openai/gpt-5-mini',
        'openai/o3',
        'openai/o4-mini',
        'google/gemini-2.5-flash-lite',
        'google/gemini-2.5-flash',
        'google/gemini-2.5-pro',
        'anthropic/claude-sonnet-4',
        'anthropic/claude-opus-4.1',
      ],
      default: 'openai/gpt-5-mini',
      labels: {
        'openai/gpt-5-chat': 'GPT‑5 Chat',
        'openai/gpt-5-mini': 'GPT‑5 Mini',
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
}
