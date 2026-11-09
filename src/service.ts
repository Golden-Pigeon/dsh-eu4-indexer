import type {
  ManagementRequest,
  ServiceState,
  Session,
  Registry,
  Environment,
} from './contracts.js'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { Engine } from './engine/runtime.js'
import { SelectionGate } from './integration/selection-gate.js'
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

const mutations = new Set([
  'configure',
  'install_engine',
  'index',
  'refresh',
  'setup',
  'bind',
  'unbind',
  'register',
  'remove',
])

export interface ServiceOptions {
  home: string
  engine?: Engine
  executablePath?: string
  concurrency?: number
  timeoutMs?: number
  toolCallTimeoutMs?: number
}
export interface DispatchOptions {
  signal?: AbortSignal
  currentSession?: string
}
type Coordinated = <T>(
  work: () => T | Promise<T>,
  signal?: AbortSignal,
) => T | Promise<T>
export class IndexerService {
  declare config: ServiceOptions
  declare home: string
  declare engine: Engine
  declare tasks: Tasks
  declare bindings: Record<string, string | null | undefined>
  declare stateWrites: Promise<void>
  declare onBinding: (
    id: string,
    name: string | null | undefined,
  ) => Promise<void>
  declare onRegistered: (name: string) => Promise<void>
  declare agents: (signal?: AbortSignal) => Session[] | Promise<Session[]>
  declare withSelections: Coordinated
  declare withSelectionRead: Coordinated
  declare requests: Map<AbortController, Promise<unknown>>
  declare management: SelectionGate
  declare closed: boolean
  declare onEngineChanging?: (signal?: AbortSignal) => void | Promise<void>
  declare onEngineChanged?: () => void | Promise<void>
  constructor(config: ServiceOptions) {
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
    this.onRegistered = async () => {}
    this.agents = () => []
    this.withSelections = (work) => work()
    this.withSelectionRead = (work) => work()
    this.requests = new Map()
    this.management = new SelectionGate()
    this.closed = false
  }
  async init() {
    await mkdir(this.home, { recursive: true })
    this.bindings = Object.assign(
      Object.create(null),
      await readJson(path.join(this.home, 'sessions.json'), {}),
    )
    const settings = await readJson<{ executablePath?: string }>(
      path.join(this.home, 'settings.json'),
      {},
    )
    if (
      !this.config.executablePath &&
      typeof settings.executablePath === 'string'
    )
      this.engine.explicit = settings.executablePath
    await this.tasks.init()
  }
  async binding(id: string) {
    return this.bindings[sessionId(id)] ?? ''
  }
  async bind(
    id: string | undefined,
    name: string | null | undefined,
    signal?: AbortSignal,
  ) {
    return this.withSelections(() => this.setBinding(id, name, signal), signal)
  }
  async setBinding(
    id: string | undefined,
    name: string | null | undefined,
    signal?: AbortSignal,
  ) {
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
  async state(signal?: AbortSignal): Promise<ServiceState> {
    const engine = await this.engine.status({ signal })
    let registry: Registry = { activeDb: '', databases: [] },
      environment: Environment | undefined
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
    const live = await this.withSelectionRead(
        () => this.agents(signal),
        signal,
      ),
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
  async dispatch(input: unknown, options: DispatchOptions = {}) {
    if (this.closed) throw new UserError('Plugin is shutting down')
    const controller = new AbortController()
    const signal = options.signal
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal
    signal.throwIfAborted()
    const request = structuredClone(
      object(input),
    ) as unknown as ManagementRequest
    const operation = string(request.operation, 'operation')
    const perform = () => this.perform(request, { ...options, signal })
    // Journal polling and cancellation remain available during activation.
    const work = ['tasks', 'cancel_task'].includes(operation)
      ? perform()
      : this.management.run(mutations.has(operation), perform, signal)
    this.requests.set(controller, work)
    try {
      return await work
    } finally {
      this.requests.delete(controller)
    }
  }
  async perform(
    input: unknown,
    { signal, currentSession }: DispatchOptions = {},
  ): Promise<unknown> {
    const request = object(input) as unknown as ManagementRequest,
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
      if (
        !checked.ready &&
        (request.executablePath ||
          !['engine_missing', 'engine_update_required'].includes(
            checked.code ?? '',
          ))
      )
        throw new UserError(checked.error ?? 'Engine is not ready')
      try {
        await this.onEngineChanging?.(signal)
        signal?.throwIfAborted()
        await writeJson(path.join(this.home, 'settings.json'), {
          executablePath: candidate.explicit,
        })
        this.engine.explicit = candidate.explicit
      } finally {
        await this.onEngineChanged?.()
      }
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
            beforeActivate: () => this.onEngineChanging?.(cancel),
            afterActivate: () => this.onEngineChanged?.(),
            withActivation: (work) => this.management.run(true, work, cancel),
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
      return this.withSelections(() => this.remove(request, signal), signal)
    }
    if (operation === 'register') {
      const name = indexName(request.name)
      this.assertIndexIdle(name)
      const result = await this.engine.call(request, {
        signal,
        timeoutMs: this.config.timeoutMs ?? 30000,
      })
      // The old file remains intact. Refresh affected clients before reporting
      // success so subsequent queries use the newly registered database.
      await this.onRegistered(name)
      return result
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
      ].includes(operation)
    )
      throw new UserError('Unknown management operation')
    return this.engine.call(request, {
      signal,
      timeoutMs: this.config.timeoutMs ?? 30000,
    })
  }
  assertIndexIdle(name: string) {
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
        'Wait for the active index task before changing this index',
        'busy',
      )
  }
  async remove(request: ManagementRequest, signal?: AbortSignal) {
    const name = indexName(request.name)
    this.assertIndexIdle(name)
    if (
      Object.values(this.bindings).includes(name) ||
      (await this.agents(signal)).some((agent) => agent.index === name)
    )
      throw new UserError(
        'This index is selected by a session. Unbind or select another index before removing it.',
        'index_in_use',
      )
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
