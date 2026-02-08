import { describe, expect, it } from 'vitest'
import { freshState } from '../src/state'

class MemoryStorage {
  private data = new Map<string, string>()
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value))
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  clear() {
    this.data.clear()
  }
}

describe('system prompt persistence', () => {
  it('uses saved default system prompt even when empty', () => {
    const storage = new MemoryStorage()
    storage.setItem('treechat-default-system-prompt', '')
    ;(globalThis as any).localStorage = storage

    const st = freshState()
    expect(st.nodes[st.rootId]?.content).toBe('')
  })
})

