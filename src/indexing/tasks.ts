import type { Task, TaskEvent } from '../contracts.js'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { readJson, writeJson, UserError, failure } from '../util.js'

/** Persistent task journal; only one writer may mutate a given index. */
type Runner = (
  signal: AbortSignal,
  onEvent: (event: TaskEvent) => void,
) => Promise<unknown>
interface PendingTask {
  row: Task
  run: Runner
  ready: boolean
}
export class Tasks {
  declare file: string
  declare limit: number
  declare historyLimit: number
  declare rows: Task[]
  declare running: Map<
    string,
    { controller: AbortController; done: Promise<void> }
  >
  declare pending: PendingTask[]
  declare closed: boolean
  declare writes: Promise<void>
  declare onCompleted?: (task: Task) => void | Promise<void>
  constructor(home: string, { concurrency = 2, historyLimit = 100 } = {}) {
    this.file = path.join(home, 'tasks.json')
    this.limit = concurrency
    this.historyLimit = historyLimit
    this.rows = []
    this.running = new Map()
    this.pending = []
    this.closed = false
    this.writes = Promise.resolve()
  }
  async init() {
    this.rows = await readJson<Task[]>(this.file, [])
    for (const task of this.rows)
      if (['queued', 'running', 'cancelling'].includes(task.state)) {
        task.state = 'interrupted'
        task.finishedAt = new Date().toISOString()
        task.error =
          'The host stopped before the task completed. Retry the task; the previous index remains available.'
      }
    await this.save()
  }
  save() {
    const snapshot = structuredClone(this.rows)
    const saved = this.writes.then(() => writeJson(this.file, snapshot))
    this.writes = saved.catch(() => {})
    return saved
  }
  list() {
    return structuredClone(this.rows)
  }
  async start(kind: string, key: string, input: Task['input'], run: Runner) {
    if (this.closed) throw new UserError('Plugin is shutting down')
    if (
      this.rows.some(
        (row) =>
          row.key === key &&
          ['queued', 'running', 'cancelling'].includes(row.state),
      )
    )
      throw new UserError('Another task is already changing this index', 'busy')
    const row: Task = {
      id: randomUUID(),
      kind,
      key,
      input,
      state: 'queued',
      createdAt: new Date().toISOString(),
      events: [],
    }
    this.rows.unshift(row)
    const active = this.rows.filter((r) =>
      ['queued', 'running', 'cancelling'].includes(r.state),
    )
    const history = this.rows
      .filter((r) => !active.includes(r))
      .slice(0, this.historyLimit)
    this.rows = [...active, ...history].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )
    const entry = { row, run, ready: false }
    this.pending.push(entry)
    try {
      await this.save()
    } catch (error) {
      this.pending = this.pending.filter((item) => item !== entry)
      row.state = 'failed'
      row.finishedAt = new Date().toISOString()
      Object.assign(row, failure(error))
      this.pump()
      throw error
    }
    entry.ready = true
    this.pump()
    return structuredClone(row)
  }
  pump() {
    while (
      !this.closed &&
      this.running.size < this.limit &&
      this.pending[0]?.ready
    ) {
      const { row, run } = this.pending.shift()!,
        controller = new AbortController()
      row.state = 'running'
      row.startedAt = new Date().toISOString()
      const done = (async () => {
        try {
          await this.save()
          controller.signal.throwIfAborted()
          row.result = await run(controller.signal, (event) => {
            if (event.type === 'progress' || event.type === 'download')
              row.progress = event.type === 'progress' ? event.data : event
            else if (event.type === 'log')
              row.events = [...row.events, event.data.message].slice(-100)
          })
          try {
            await this.onCompleted?.(structuredClone(row))
          } catch (error) {
            row.warnings = [failure(error).error]
          }
          row.state = 'succeeded'
        } catch (error) {
          row.state = controller.signal.aborted ? 'cancelled' : 'failed'
          Object.assign(row, failure(error))
        } finally {
          row.finishedAt = new Date().toISOString()
          this.running.delete(row.id)
          await this.save()
          this.pump()
        }
      })()
      // Attach immediately so shutdown and cancellations observe the same owned promise.
      this.running.set(row.id, { controller, done })
      done.catch((error) => {
        row.state = 'failed'
        row.error = failure(error).error
      })
    }
  }
  async cancel(id: string) {
    const row = this.rows.find((r) => r.id === id)
    if (!row) throw new UserError('Unknown task')
    const queued = this.pending.findIndex((t) => t.row === row)
    if (queued >= 0) {
      this.pending.splice(queued, 1)
      row.state = 'cancelled'
      row.finishedAt = new Date().toISOString()
      this.pump()
      await this.save()
    } else if (this.running.has(id)) {
      row.state = 'cancelling'
      this.running
        .get(id)!
        .controller.abort(new DOMException('Cancelled by user', 'AbortError'))
      await this.save()
    }
    return structuredClone(row)
  }
  async stop() {
    this.closed = true
    for (const { row } of this.pending.splice(0)) {
      row.state = 'interrupted'
      row.finishedAt = new Date().toISOString()
    }
    const work = [...this.running.values()]
    for (const task of work)
      task.controller.abort(new DOMException('Plugin unloaded', 'AbortError'))
    await Promise.allSettled(work.map((task) => task.done))
    await this.save()
  }
}
