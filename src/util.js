import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export class UserError extends Error {
  constructor(message, code = 'invalid_request') {
    super(message)
    this.code = code
  }
}
export function object(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new UserError('Expected an object')
  return value
}
export function string(value, label, fallback) {
  if (value === undefined && fallback !== undefined) return fallback
  if (typeof value !== 'string' || !value.trim() || value.length > 4096)
    throw new UserError(`Invalid ${label}`)
  return value
}
export function indexName(value) {
  const name = string(value, 'index name')
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(name))
    throw new UserError(
      'Use 1-80 letters, digits, dots, underscores or hyphens for the index name',
    )
  return name
}
export function sessionId(value) {
  const id = string(value, 'session id')
  if (id.length > 128 || /[\x00-\x1f\x7f]/.test(id))
    throw new UserError('Invalid session id')
  return id
}
export async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}
export async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(temp, JSON.stringify(value, null, 2) + '\n', {
      mode: 0o600,
    })
    await rename(temp, file)
  } finally {
    await rm(temp, { force: true })
  }
}
export function failure(error) {
  return {
    error: error.message || String(error),
    code: error.code || 'operation_failed',
  }
}
export function cleanEnv(extra = {}) {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) => !/KEY|TOKEN|PASSWORD|SECRET|^DSH_/i.test(name),
      ),
    ),
    ...extra,
  }
}
