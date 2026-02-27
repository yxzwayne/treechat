import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

export async function mkdirp(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true })
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8')
  try {
    return JSON.parse(raw) as T
  } catch (e: any) {
    const msg = e?.message || String(e)
    throw new Error(`Failed to parse JSON at ${filePath}: ${msg}`)
  }
}

export async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    return await readJsonFile<T>(filePath)
  } catch (e: any) {
    if (e?.code === 'ENOENT') return null
    throw e
  }
}

export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  const dir = path.dirname(filePath)
  await mkdirp(dir)
  const base = path.basename(filePath)
  const tmp = path.join(dir, `.${base}.tmp.${process.pid}.${crypto.randomBytes(8).toString('hex')}`)
  const payload = JSON.stringify(value, null, 2) + '\n'
  await fs.writeFile(tmp, payload, 'utf8')
  await fs.rename(tmp, filePath)
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p)
    return true
  } catch (e: any) {
    if (e?.code === 'ENOENT') return false
    throw e
  }
}

