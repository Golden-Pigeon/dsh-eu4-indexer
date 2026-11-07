/** One official MCP client per live agent; database state never crosses sessions. */
export class SessionConnections {
  constructor(ctx, service, clientPlugin) {
    this.ctx = ctx
    this.service = service
    this.plugin = clientPlugin
    this.bindings = new Map()
    this.tails = new Map()
    this.closed = false
    this.suspended = false
    this.disposed = new Set()
    service.onBinding = (id, name) => this.rebind(id, name)
    service.agents = () =>
      ctx.agents.list().map((agent) => ({
        id: String(agent.id),
        title: String(agent.session?.title ?? agent.id),
        index: this.bindings.get(String(agent.id))?.db ?? '',
      }))
  }
  async select(agent, requested) {
    if (
      requested === null ||
      (requested === undefined &&
        this.service.bindings[String(agent.id)] === null)
    )
      return
    const registry = await this.service.engine.call({ operation: 'list' })
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
  async attach(agent, requested) {
    if (this.closed || this.suspended || this.disposed.has(String(agent.id)))
      return
    let db
    try {
      db = await this.select(agent, requested)
    } catch (error) {
      if (error.code === 'engine_missing') return
      throw error
    }
    if (!db) return
    const executable = await this.service.engine.resolve()
    const config = {
      serverName: 'eu4',
      transport: 'stdio',
      command: executable,
      args: ['serve', '--db', db.path, '--query-session', String(agent.id)],
      env: { EU4INDEXER_HOME: this.service.home },
      cwd: this.service.home,
      toolCallTimeoutMs: this.service.config.toolCallTimeoutMs ?? 60000,
      failOnStartupError: true,
      maxInstructionBytes: 32768,
    }
    const handle = agent.ctx.plugin(this.plugin, config)
    try {
      await handle.await()
      if (
        this.closed ||
        this.suspended ||
        this.disposed.has(String(agent.id))
      ) {
        await handle.dispose()
        return
      }
      this.bindings.set(String(agent.id), { handle, agent, db: db.name })
    } catch (error) {
      await handle.dispose()
      throw error
    }
  }
  async disposeAgent(id) {
    this.disposed.add(id)
    await this.tails.get(id)?.catch(() => {})
    await this.release(id)
  }
  async release(id) {
    const binding = this.bindings.get(id)
    if (binding) {
      this.bindings.delete(id)
      await binding.handle.dispose()
    }
  }
  rebind(id, name) {
    const previous = this.tails.get(id) ?? Promise.resolve()
    const next = previous
      .catch(() => {})
      .then(async () => {
        if (this.closed || this.suspended || this.disposed.has(id)) return
        const agent = this.ctx.agents.get(id)
        if (!agent) return
        const old = this.bindings.get(id)?.db
        await this.release(id)
        try {
          await this.attach(agent, name)
        } catch (error) {
          if (old) await this.attach(agent, old)
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
  async refresh(name) {
    const results = await Promise.allSettled(
      this.ctx.agents
        .list()
        .filter(
          (agent) =>
            !name ||
            this.bindings.get(String(agent.id))?.db === name ||
            this.service.bindings[String(agent.id)] === name ||
            !this.bindings.has(String(agent.id)),
        )
        .map((agent) =>
          this.rebind(
            String(agent.id),
            this.service.bindings[String(agent.id)],
          ),
        ),
    )
    const failed = results.find((result) => result.status === 'rejected')
    if (failed) throw failed.reason
  }
  async suspend() {
    this.suspended = true
    await Promise.allSettled(this.tails.values())
    await Promise.all([...this.bindings.keys()].map((id) => this.release(id)))
  }
  async resume() {
    this.suspended = false
    await this.refresh()
  }
  async stop() {
    this.closed = true
    await Promise.allSettled(this.tails.values())
    await Promise.allSettled(
      [...this.bindings.keys()].map((id) => this.release(id)),
    )
  }
}
