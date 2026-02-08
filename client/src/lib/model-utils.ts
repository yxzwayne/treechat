export function pickEnabledModel(
  requested: string | null | undefined,
  enabledModels: string[],
  defaultModel: string
): string {
  const preferred = (requested || '').trim()
  if (preferred && enabledModels.includes(preferred)) return preferred
  if (enabledModels.includes(defaultModel)) return defaultModel
  if (enabledModels.length > 0) return enabledModels[0]
  return defaultModel
}
