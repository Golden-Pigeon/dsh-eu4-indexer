import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { Engine } from './engine/runtime.js'
import { Tasks } from './indexing/tasks.js'
import {
  readJson,
  writeJson,
  object,
  string,
  sessionId,
  indexName,
  UserError,
} from './util.js'

export class IndexerService {
  constructor(config) {
    this.config = config
    this.home = config.home
    this.engine =
      config.engine ??
      new Engine({
        home: this.home,
        executablePath: config.executablePath,
        timeoutMs: config.timeoutMs,
      })
    this.tasks = new Tasks(this.home, { concurrency: config.concurrency ?? 2 })
    this.bindings = Object.create(null)
    this.stateWrites = Promise.resolve()
    this.onBinding = async () => {}
    this.agents = () => []
    this.requests = new Map()
    this.closed = false
  }
  async init() {
    await mkdir(this.home, { recursive: true })
    this.bindings = Object.assign(
      Object.create(null),
      await readJson(path.join(this.home, 'sessions.json'), {}),
    )
    const settings = await readJson(path.join(this.home, 'settings.json'), {})
    if (
      !this.config.executablePath &&
      typeof settings.executablePath === 'string'
    )
      this.engine.explicit = settings.executablePath
    await this.tasks.init()
  }
  async binding(id) {
    return this.bindings[sessionId(id)] ?? ''
  }
  async bind(id, name, signal) {
    id = sessionId(id)
    name = name === null ? null : indexName(name)
    const registry = await this.engine.call(
      { operation: 'list' },
      { signal, timeoutMs: this.config.timeoutMs ?? 30000 },
    )
    if (name !== null && !registry.databases.some((db) => db.name === name))
      throw new UserError('Unknown index')
    const old = this.bindings[id]
    // Rebuild the scoped MCP connection before committing the durable preference.
    await this.onBinding(id, name)
    this.bindings[id] = name
    const snapshot = structuredClone(this.bindings)
    const saved = this.stateWrites.then(() =>
      writeJson(path.join(this.home, 'sessions.json'), snapshot),
    )
    this.stateWrites = saved.catch(() => {})
    try {
      await saved
    } catch (error) {
      if (old === undefined) delete this.bindings[id]
      else this.bindings[id] = old
      await this.onBinding(id, old).catch(() => {})
      throw error
    }
    return { sessionId: id, index: name }
  }
  async state(signal) {
    const engine = await this.engine.status({ signal })
    let registry = { activeDb: '', databases: [] },
      environment
    if (engine.ready)
      [registry, environment] = await Promise.all([
        this.engine.call(
          { operation: 'list' },
          { signal, timeoutMs: this.config.timeoutMs ?? 30000 },
        ),
        this.engine.call(
          { operation: 'status' },
          { signal, timeoutMs: this.config.timeoutMs ?? 30000 },
        ),
      ])
    const live = this.agents(),
      active = new Set(live.map((agent) => agent.id))
    const sessions = [
      ...live,
      ...Object.keys(this.bindings)
        .filter((id) => !active.has(id))
        .map((id) => ({ id, title: id, loaded: false })),
    ]
    return {
      engine,
      registry,
      environment,
      tasks: this.tasks.list(),
      bindings: { ...this.bindings },
      sessions,
      home: this.home,
    }
  }
  async dispatch(input, options = {}) {
    if (this.closed) throw new UserError('Plugin is shutting down')
    const controller = new AbortController()
    const signal = options.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal
    signal.throwIfAborted()
    const work = this.perform(input, { ...options, signal })
    this.requests.set(controller, work)
    try {
      return await work
    } finally {
      this.requests.delete(controller)
    }
  }
  async perform(input, { signal, currentSession } = {}) {
    const request = object(input),
      operation = string(request.operation, 'operation')
    if (operation === 'state') return this.state(signal)
    if (operation === 'configure') {
      if (
        this.tasks
          .list()
          .some((task) =>
            ['queued', 'running', 'cancelling'].includes(task.state),
          )
      )
        throw new UserError(
          'Wait for background tasks before changing engines',
          'busy',
        )
      if (typeof request.executablePath !== 'string')
        throw new UserError('Expected an executable path')
      const candidate = new Engine({
        home: this.home,
        executablePath: request.executablePath,
        timeoutMs: this.config.timeoutMs,
      })
      const checked = await candidate.status({ signal })
      if (!checked.ready) throw new UserError(checked.error)
      await writeJson(path.join(this.home, 'settings.json'), {
        executablePath: request.executablePath,
      })
      await this.onEngineChanging?.()
      this.engine.explicit = request.executablePath
      await this.onEngineChanged?.()
      return checked
    }
    if (operation === 'tasks') return this.tasks.list()
    if (operation === 'cancel_task')
      return this.tasks.cancel(string(request.taskId, 'task id'))
    if (operation === 'bind')
      return this.bind(
        currentSession ?? request.sessionId,
        request.name,
        signal,
      )
    if (operation === 'unbind')
      return this.bind(currentSession ?? request.sessionId, null, signal)
    if (operation === 'install_engine') {
      if (
        this.tasks
          .list()
          .some((task) =>
            ['queued', 'running', 'cancelling'].includes(task.state),
          )
      )
        throw new UserError(
          'Wait for background tasks before installing an engine',
          'busy',
        )
      return this.tasks.start(
        'install_engine',
        'engine',
        {},
        (cancel, onEvent) =>
          this.engine.install({
            signal: cancel,
            onEvent,
            beforeActivate: () => this.onEngineChanging?.(),
            afterActivate: () => this.onEngineChanged?.(),
          }),
      )
    }
    if (['index', 'refresh', 'setup'].includes(operation)) {
      if (
        this.tasks
          .list()
          .some(
            (task) =>
              task.kind === 'install_engine' &&
              ['queued', 'running', 'cancelling'].includes(task.state),
          )
      )
        throw new UserError('Wait for the engine installation', 'busy')
      const game = string(request.game, 'game', 'eu4')
      if (!['eu4', 'hoi4'].includes(game))
        throw new UserError('Unsupported game')
      if (
        this.tasks
          .list()
          .some(
            (task) =>
              ['queued', 'running', 'cancelling'].includes(task.state) &&
              (operation === 'setup' || task.kind === 'setup'),
          )
      )
        throw new UserError(
          'Finish rule updates and index builds before changing rules or starting another build',
          'busy',
        )
      if (operation !== 'setup') indexName(request.name)
      const key =
        operation === 'setup' ? `rules:${game}` : `index:${request.name}`
      return this.tasks.start(operation, key, request, (cancel, onEvent) =>
        this.engine.call(request, { signal: cancel, onEvent }),
      )
    }
    if (operation === 'remove') {
      const name = indexName(request.name)
      if (
        this.tasks
          .list()
          .some(
            (t) =>
              t.key === `index:${name}` &&
              ['queued', 'running', 'cancelling'].includes(t.state),
          )
      )
        throw new UserError(
          'Wait for the active index task before removing this index',
          'busy',
        )
      if (
        Object.values(this.bindings).includes(name) ||
        this.agents().some((agent) => agent.index === name)
      )
        throw new UserError(
          'This index is selected by a session. Unbind or select another index before removing it.',
          'index_in_use',
        )
    }
    if (
      ![
        'capabilities',
        'status',
        'detect',
        'workshop',
        'playsets',
        'list',
        'inspect',
        'register',
        'remove',
      ].includes(operation)
    )
      throw new UserError('Unknown management operation')
    return this.engine.call(request, {
      signal,
      timeoutMs: this.config.timeoutMs ?? 30000,
    })
  }
  async stop() {
    this.closed = true
    const work = [...this.requests.values()]
    for (const controller of this.requests.keys())
      controller.abort(new DOMException('Plugin unloaded', 'AbortError'))
    await Promise.allSettled([this.tasks.stop(), ...work])
    await this.stateWrites
  }
}
