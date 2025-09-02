export const allowedModels = [
  'openai/gpt-5-chat',
  'openai/gpt-5-mini',
  'openai/o3',
  'openai/o4-mini',
  'google/gemini-2.5-flash-lite',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
  'anthropic/claude-sonnet-4',
  'anthropic/claude-opus-4.1',
] as const

export type AllowedModel = typeof allowedModels[number]

export const defaultModel: AllowedModel = 'openai/gpt-5-mini'

export const modelLabels: Record<AllowedModel, string> = {
  'openai/gpt-5-chat': 'GPT‑5 Chat',
  'openai/gpt-5-mini': 'GPT‑5 Mini',
  'openai/o3': 'OpenAI O3',
  'openai/o4-mini': 'OpenAI O4 Mini',
  'google/gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
  'google/gemini-2.5-flash': 'Gemini 2.5 Flash',
  'google/gemini-2.5-pro': 'Gemini 2.5 Pro',
  'anthropic/claude-sonnet-4': 'Claude 4 Sonnet',
  'anthropic/claude-opus-4.1': 'Claude 4.1 Opus',
}
