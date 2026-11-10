import type { Context } from '@deepseek-ai/cordis'
import type * as McpClient from '@deepseek-ai/dsh-mcp-client'
import type { IndexerService } from '../service.js'
import { failure, object } from '../util.js'
import { SelectionGate } from './selection-gate.js'

/** One official MCP client per live agent; database state never crosses sessions. */
type Agent = ReturnType<Context['agents']['list']>[number]
type SessionId = Parameters<Context['agents']['get']>[0]
export class SessionConnections {
  declare ctx: Context
  declare service: IndexerService
  declare plugin: typeof McpClient
  declare bindings: Map<
    string,
    { handle: ReturnType<Context['plugin']>; agent: Agent; db: string }
  >
  declare tails: Map<string, Promise<void>>
  declare closed: boolean
  declare suspended: boolean
  declare disposed: WeakSet<Agent>
  declare enabled: WeakSet<Agent>
  declare controller: AbortController
  declare gate: SelectionGate
  constructor(
    ctx: Context,
    service: IndexerService,
    clientPlugin: typeof McpClient,
  ) {
    this.ctx = ctx
    this.service = service
    this.plugin = clientPlugin
    this.bindings = new Map()
    this.tails = new Map()
    this.closed = false
    this.suspended = false
    // A resumed or cleared chat reuses its id with a new Agent instance.
    this.disposed = new WeakSet()
    this.enabled = new WeakSet()
    this.controller = new AbortController()
    this.gate = new SelectionGate()
    service.withSelections = (work, signal) =>
      this.gate.run(true, work, this.signal(signal))
    service.withSelectionRead = (work, signal) =>
      this.gate.run(false, work, this.signal(signal))
    // setBinding already owns the exclusive selection gate.
    service.onBinding = (id, name) => this.queueRebind(id, name)
    service.agents = (signal) =>
      Promise.all(
        ctx.agents.list().map(async (agent) => ({
          id: String(agent.id),
          title: String(
            (agent.session && 'title' in agent.session
              ? agent.session.title
              : undefined) ?? agent.id,
          ),
          index: await this.currentIndex(agent, signal),
        })),
      )
    ctx.on?.('tools/execute', (exec, next) => {
      if (
        !exec.name.startsWith('mcp__eu4__') ||
        !this.bindings.has(String(exec.agent?.id))
      )
        return next()
      const write = [
        'mcp__eu4__select_database',
        'mcp__eu4__close_query_session',
      ].includes(exec.name)
      return this.gate.run(
        write,
        () => {
          if (this.suspended || this.closed)
            throw new Error(
              'Query connection is changing; retry after reconnecting',
            )
          return next()
        },
        this.signal(exec.signal),
      )
    })
  }
  signal(signal?: AbortSignal) {
    return signal
      ? AbortSignal.any([signal, this.controller.signal])
      : this.controller.signal
  }
  toolsEnabled(agent?: Agent) {
    return (
      !!agent &&
      !this.closed &&
      !this.disposed.has(agent) &&
      this.ctx.agents.get(agent.id) === agent &&
      this.enabled.has(agent)
    )
  }
  async setToolsEnabled(agent: Agent, enabled: boolean, signal?: AbortSignal) {
    return this.gate.run(
      true,
      async () => {
        const id = String(agent.id)
        if (
          this.closed ||
          this.disposed.has(agent) ||
          this.ctx.agents.get(agent.id) !== agent
        )
          throw new Error('This chat is no longer active')
        this.signal(signal).throwIfAborted()
        if (enabled) {
          const wasEnabled = this.toolsEnabled(agent)
          if (wasEnabled && this.bindings.get(id)?.agent === agent)
            return { enabled: true, queryConnected: true }
          this.enabled.add(agent)
          // Management stays available even if the engine or saved index needs repair.
          try {
            await this.queueRebind(id, undefined, signal)
            this.signal(signal).throwIfAborted()
            if (
              this.disposed.has(agent) ||
              this.ctx.agents.get(agent.id) !== agent
            )
              throw new Error('This chat is no longer active')
            return { enabled: true, queryConnected: this.bindings.has(id) }
          } catch (error) {
            if (
              this.signal(signal).aborted ||
              this.disposed.has(agent) ||
              this.ctx.agents.get(agent.id) !== agent
            ) {
              if (!wasEnabled) this.enabled.delete(agent)
              if (this.bindings.get(id)?.agent === agent) await this.release(id)
              throw error
            }
            return {
              enabled: true,
              queryConnected: false,
              queryError: failure(error).error,
            }
          }
        }
        this.enabled.delete(agent)
        await this.release(id)
        return { enabled: false, queryConnected: false }
      },
      this.signal(signal),
    )
  }
  async currentIndex(agent: Agent, signal?: AbortSignal): Promise<string> {
    const binding = this.bindings.get(String(agent.id))
    if (!binding) return ''
    const tool = this.ctx.tools.get('mcp__eu4__list_databases', agent)
    if (!tool)
      throw new Error('Query connection is not ready; retry after reconnecting')
    // rc.1's MCP executor only reads agent/signal; an inspection is outside a
    // model turn and does not own the pipeline's turn/approval bookkeeping.
    const execute = tool.execute as (
      args: Record<string, never>,
      context: { agent: Agent; signal: AbortSignal },
    ) => Promise<unknown>
    const result = object(
      await execute.call(tool, {}, { agent, signal: this.signal(signal) }),
    )
    if (result.isError)
      throw new Error('Could not inspect the current query selection')
    if (!Array.isArray(result.content))
      throw new Error('Invalid database selection response')
    const rows: unknown = JSON.parse(
      result.content
        .flatMap((c: unknown) => {
          const block = object(c)
          return block.type === 'text' && typeof block.text === 'string'
            ? [block.text]
            : []
        })
        .join(''),
    )
    if (!Array.isArray(rows))
      throw new Error('Invalid database selection response')
    const selected: unknown = rows.find(
      (row: unknown) =>
        !!row && typeof row === 'object' && 'isActive' in row && row.isActive,
    )
    if (
      !selected ||
      typeof selected !== 'object' ||
      !('name' in selected) ||
      typeof selected.name !== 'string'
    )
      throw new Error(
        'Current query index is no longer registered; reconnect before removing indexes',
      )
    return selected.name
  }
  async select(agent: Agent, requested?: string | null, signal?: AbortSignal) {
    if (
      requested === null ||
      (requested === undefined &&
        this.service.bindings[String(agent.id)] === null)
    )
      return
    const registry = await this.service.engine.call(
      { operation: 'list' },
      {
        signal: this.signal(signal),
        timeoutMs: this.service.config.timeoutMs ?? 30000,
      },
    )
    const name =
      requested ??
      this.service.bindings[String(agent.id)] ??
      registry.activeDb ??
      ''
    const selected = registry.databases.find((db) => db.name === name)
    if (name && !selected)
      throw new Error(
        `Selected index '${name}' is no longer registered. Choose another index explicitly.`,
      )
    return (
      selected ??
      (registry.databases.length === 1 ? registry.databases[0] : undefined)
    )
  }
  async attach(agent: Agent, requested?: string | null, signal?: AbortSignal) {
    signal = this.signal(signal)
    signal.throwIfAborted()
    if (!this.toolsEnabled(agent) || this.suspended) return
    let db
    try {
      db = await this.select(agent, requested, signal)
    } catch (error) {
      if (
        ['engine_missing', 'engine_update_required'].includes(
          failure(error).code,
        )
      )
        return
      throw error
    }
    signal.throwIfAborted()
    if (!db || !this.toolsEnabled(agent) || this.suspended) return
    const launch = await this.service.engine.querySession({
      database: db.path,
      sessionId: String(agent.id),
    })
    signal.throwIfAborted()
    if (!this.toolsEnabled(agent) || this.suspended) return
    const config: McpClient.StdioConfig = {
      serverName: 'eu4',
      transport: 'stdio',
      ...launch,
      toolCallTimeoutMs: this.service.config.toolCallTimeoutMs ?? 60000,
      failOnStartupError: true,
      maxInstructionBytes: 32768,
    }
    const handle = agent.ctx.plugin(this.plugin, config)
    let abort = () => {}
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => reject(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    })
    try {
      await Promise.race([
        Promise.resolve().then(() => handle.await()),
        cancelled,
      ])
      signal.throwIfAborted()
      if (!this.toolsEnabled(agent) || this.suspended) {
        await handle.dispose()
        return
      }
      this.bindings.set(String(agent.id), { handle, agent, db: db.name })
    } catch (error) {
      await handle.dispose()
      throw error
    } finally {
      signal.removeEventListener('abort', abort)
    }
  }
  async disposeAgent(agent: Agent) {
    const id = String(agent.id)
    this.disposed.add(agent)
    this.enabled.delete(agent)
    await this.tails.get(id)?.catch(() => {})
    // A late disposal must not close a replacement Agent's connection.
    await this.gate.run(
      true,
      async () => {
        if (this.bindings.get(id)?.agent === agent) await this.release(id)
      },
      this.controller.signal,
    )
  }
  async release(id: string) {
    const binding = this.bindings.get(id)
    if (binding) {
      this.bindings.delete(id)
      await binding.handle.dispose()
    }
  }
  rebind(id: string, name?: string | null) {
    return this.gate.run(
      true,
      () => this.queueRebind(id, name),
      this.controller.signal,
    )
  }
  queueRebind(id: string, name?: string | null, signal?: AbortSignal) {
    const previous = this.tails.get(id) ?? Promise.resolve()
    const next = previous
      .catch(() => {})
      .then(async () => {
        if (this.closed || this.suspended) return
        signal?.throwIfAborted()
        const agent = this.ctx.agents.get(id as SessionId)
        if (!agent || this.disposed.has(agent)) return
        const old = this.bindings.get(id)?.db
        await this.release(id)
        try {
          await this.attach(agent, name, signal)
        } catch (error) {
          if (old && !this.signal(signal).aborted) await this.attach(agent, old)
          throw error
        }
      })
    this.tails.set(id, next)
    next
      .finally(() => {
        if (this.tails.get(id) === next) this.tails.delete(id)
      })
      .catch(() => {})
    return next
  }
  async refresh(name?: string) {
    return this.gate.run(
      true,
      async () => {
        const results = await Promise.allSettled(
          this.ctx.agents.list().map(async (agent) => {
            const id = String(agent.id)
            if (
              name &&
              this.bindings.has(id) &&
              this.bindings.get(id)!.db !== name &&
              this.service.bindings[id] !== name &&
              (await this.currentIndex(agent)) !== name
            )
              return
            await this.queueRebind(id, this.service.bindings[id])
          }),
        )
        const failed = results.find((result) => result.status === 'rejected')
        if (failed) throw failed.reason
      },
      this.controller.signal,
    )
  }
  async suspend(signal?: AbortSignal) {
    return this.gate.run(
      true,
      async () => {
        this.suspended = true
        await Promise.allSettled(this.tails.values())
        const released = await Promise.allSettled(
          [...this.bindings.keys()].map((id) => this.release(id)),
        )
        const failed = released.find((result) => result.status === 'rejected')
        if (failed) throw failed.reason
      },
      this.signal(signal),
    )
  }
  async resume() {
    if (!this.suspended) return
    this.suspended = false
    await this.refresh()
  }
  async stop() {
    this.closed = true
    this.controller.abort(new DOMException('Plugin unloaded', 'AbortError'))
    await Promise.allSettled(this.tails.values())
    await Promise.allSettled(
      [...this.bindings.keys()].map((id) => this.release(id)),
    )
    // An in-flight unload removes its binding before awaiting client disposal.
    // Close known clients first to interrupt queries, then drain their coordinator.
    await this.gate.run(true, () => {})
  }
}
