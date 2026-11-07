import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { readJson, writeJson, UserError, failure } from '../util.js'

/** Persistent task journal; only one writer may mutate a given index. */
export class Tasks {
  constructor(home, { concurrency = 2, historyLimit = 100 } = {}) {
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
    this.rows = await readJson(this.file, [])
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
  async start(kind, key, input, run) {
    if (this.closed) throw new UserError('Plugin is shutting down')
    if (
      this.rows.some(
        (row) =>
          row.key === key &&
          ['queued', 'running', 'cancelling'].includes(row.state),
      )
    )
      throw new UserError('Another task is already changing this index', 'busy')
    const row = {
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
    await this.save()
    this.pending.push({ row, run })
    this.pump()
    return structuredClone(row)
  }
  pump() {
    while (
      !this.closed &&
      this.running.size < this.limit &&
      this.pending.length
    ) {
      const { row, run } = this.pending.shift(),
        controller = new AbortController()
      row.state = 'running'
      row.startedAt = new Date().toISOString()
      const done = (async () => {
        try {
          await this.save()
          row.result = await run(controller.signal, (event) => {
            if (event.type === 'progress' || event.type === 'download')
              row.progress = event.data ?? event
            else if (event.type === 'log')
              row.events = [...row.events, event.data.message].slice(-100)
          })
          try {
            await this.onCompleted?.(structuredClone(row))
          } catch (error) {
            row.warnings = [error.message]
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
        row.error = error.message
      })
    }
  }
  async cancel(id) {
    const row = this.rows.find((r) => r.id === id)
    if (!row) throw new UserError('Unknown task')
    const queued = this.pending.findIndex((t) => t.row === row)
    if (queued >= 0) {
      this.pending.splice(queued, 1)
      row.state = 'cancelled'
      row.finishedAt = new Date().toISOString()
      await this.save()
    } else if (this.running.has(id)) {
      row.state = 'cancelling'
      this.running
        .get(id)
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
