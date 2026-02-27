export class Mutex {
  private locked = false
  private waiters: Array<() => void> = []

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.lock()
    try {
      return await fn()
    } finally {
      this.unlock()
    }
  }

  private lock(): Promise<void> {
    if (!this.locked) {
      this.locked = true
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve)
    })
  }

  private unlock() {
    const next = this.waiters.shift()
    if (next) {
      next()
      return
    }
    this.locked = false
  }
}

export class MutexMap<Key> {
  private map = new Map<Key, Mutex>()

  runExclusive<T>(key: Key, fn: () => Promise<T>): Promise<T> {
    let m = this.map.get(key)
    if (!m) {
      m = new Mutex()
      this.map.set(key, m)
    }
    return m.runExclusive(fn)
  }
}

