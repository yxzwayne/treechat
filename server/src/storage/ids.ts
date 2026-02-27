const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const MESSAGE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/

export function assertUuid(id: string, label: string): string {
  const v = String(id || '').trim()
  if (!UUID_RE.test(v)) {
    const err = new Error(`${label} must be a UUID`)
    ;(err as any).status = 400
    throw err
  }
  return v
}

export function assertMessageId(id: string, label: string): string {
  const v = String(id || '').trim()
  if (!MESSAGE_ID_RE.test(v) && !UUID_RE.test(v)) {
    const err = new Error(`${label} is invalid`)
    ;(err as any).status = 400
    throw err
  }
  return v
}

