export const allowedModels = [
  'google/gemini-3-flash-preview',
  'openai/gpt-5.2-chat',
  'anthropic/claude-sonnet-4.5',
] as const

export type AllowedModel = typeof allowedModels[number]

export const legacyModels = [
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

export type LegacyModel = typeof legacyModels[number]
export type AnyModel = AllowedModel | LegacyModel

export const defaultModel: AllowedModel = 'openai/gpt-5.2-chat'

export const modelLabels: Record<AnyModel, string> = {
  'google/gemini-3-flash-preview': 'Gemini 3 Flash Preview',
  'openai/gpt-5.2-chat': 'GPT‑5.2 Chat',
  'anthropic/claude-sonnet-4.5': 'Claude 4.5 Sonnet',
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

export const modelAliases: Record<LegacyModel, AllowedModel> = {
  'openai/gpt-5-chat': 'openai/gpt-5.2-chat',
  'openai/gpt-5-mini': 'openai/gpt-5.2-chat',
  'openai/o3': 'openai/gpt-5.2-chat',
  'openai/o4-mini': 'openai/gpt-5.2-chat',
  'google/gemini-2.5-flash-lite': 'google/gemini-3-flash-preview',
  'google/gemini-2.5-flash': 'google/gemini-3-flash-preview',
  'google/gemini-2.5-pro': 'google/gemini-3-flash-preview',
  'anthropic/claude-sonnet-4': 'anthropic/claude-sonnet-4.5',
  'anthropic/claude-opus-4.1': 'anthropic/claude-sonnet-4.5',
}

export function resolveModel(requested: string): AllowedModel {
  if ((allowedModels as readonly string[]).includes(requested)) return requested as AllowedModel
  if ((legacyModels as readonly string[]).includes(requested)) return modelAliases[requested as LegacyModel] || defaultModel
  return defaultModel
}
