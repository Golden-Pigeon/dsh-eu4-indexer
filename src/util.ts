import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Failure } from './contracts.js'

export class UserError extends Error {
  declare code: string
  constructor(message: string, code = 'invalid_request') {
    super(message)
    this.code = code
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new UserError('Expected an object')
  return value as Record<string, unknown>
}
export function string(
  value: unknown,
  label: string,
  fallback?: string,
): string {
  if (value === undefined && fallback !== undefined) return fallback
  if (typeof value !== 'string' || !value.trim() || value.length > 4096)
    throw new UserError(`Invalid ${label}`)
  return value
}
export function indexName(value: unknown) {
  const name = string(value, 'index name')
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(name))
    throw new UserError(
      'Use 1-80 letters, digits, dots, underscores or hyphens for the index name',
    )
  return name
}
export function sessionId(value: unknown) {
  const id = string(value, 'session id')
  if (id.length > 128 || /[\x00-\x1f\x7f]/.test(id))
    throw new UserError('Invalid session id')
  return id
}
export async function readJson<T>(file: string, fallback: T): Promise<T>
export async function readJson<T = unknown>(
  file: string,
): Promise<T | undefined>
export async function readJson<T>(
  file: string,
  fallback?: T,
): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch (error) {
    if (failure(error).code === 'ENOENT') return fallback
    throw error
  }
}
export async function writeJson(file: string, value: unknown) {
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
export function failure(error: unknown): Failure {
  const detail =
    error && typeof error === 'object'
      ? (error as { message?: unknown; code?: unknown })
      : {}
  return {
    error:
      typeof detail.message === 'string' && detail.message
        ? detail.message
        : String(error),
    code:
      typeof detail.code === 'string' && detail.code
        ? detail.code
        : 'operation_failed',
  }
}
export function cleanEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) => !/KEY|TOKEN|PASSWORD|SECRET|^DSH_/i.test(name),
      ),
    ),
    ...extra,
  }
}
