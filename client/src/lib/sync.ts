import { Role } from '../types'

type Job =
  | { type: 'upsert_message'; conversationId: string; message: { external_id: string; parent_external_id?: string | null; role: Role; content: string; model?: string; created_ts: number } }

const KEY = 'treechat-sync-queue'

function readQueue(): Job[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) as Job[] : []
  } catch { return [] }
}

function writeQueue(q: Job[]) {
  try { localStorage.setItem(KEY, JSON.stringify(q)) } catch {}
}

export function enqueue(job: Job) {
  const q = readQueue()
  q.push(job)
  writeQueue(q)
}

export async function flush() {
  let q = readQueue()
  if (q.length === 0) return
  const next: Job[] = []
  for (const job of q) {
    try {
      if (job.type === 'upsert_message') {
        await fetch(`/api/conversations/${job.conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(job.message)
        }).then(r => { if (!r.ok) throw new Error('bad status') })
      }
    } catch {
      next.push(job)
    }
  }
  writeQueue(next)
}

export function startAutoFlush() {
  flush()
  setInterval(flush, 10000)
}
