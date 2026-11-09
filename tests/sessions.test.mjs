import test from 'node:test'
import assert from 'node:assert/strict'
import { SessionConnections } from '../dist/integration/sessions.js'
import { IndexerService } from '../dist/service.js'
function fixture() {
  const clients = [],
    agents = new Map(),
    service = {
      config: {},
      home: '/tmp',
      bindings: {},
      engine: {
        call: async () => ({
          activeDb: 'a',
          databases: [
            { name: 'a', path: '/a' },
            { name: 'b', path: '/b' },
          ],
        }),
        resolve: async () => '/engine',
      },
    }
  for (const id of ['one', 'two'])
    agents.set(id, {
      id,
      ctx: {
        plugin(_plugin, config) {
          const row = { config, disposed: false }
          clients.push(row)
          return {
            await: async () => {},
            dispose: async () => {
              row.disposed = true
            },
          }
        },
      },
    })
  const ctx = {
    agents: { get: (id) => agents.get(id), list: () => [...agents.values()] },
    tools: {
      get: (_name, agent) => ({
        execute: async () => ({
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                ['a', 'b'].map((name) => ({
                  name,
                  isActive:
                    name ===
                    (agent.selected ??
                      clients
                        .findLast(
                          (c) =>
                            c.config.args.includes(agent.id) && !c.disposed,
                        )
                        ?.config.args[2]?.slice(1)),
                })),
              ),
            },
          ],
        }),
      }),
    },
  }
  return {
    ctx,
    clients,
    service,
    agents,
    sessions: new SessionConnections(ctx, service, {}),
  }
}
test('same public MCP namespace is scoped independently to each agent', async () => {
  const f = fixture()
  try {
    await f.sessions.rebind('one', 'a')
    await f.sessions.rebind('two', 'b')
    assert.deepEqual(
      [...f.sessions.bindings.values()].map((v) => v.db),
      ['a', 'b'],
    )
    assert.equal(f.clients[0].config.serverName, f.clients[1].config.serverName)
    assert.ok(f.clients[0].config.args.includes('one'))
    await f.sessions.rebind('one', 'b')
    assert.equal(f.sessions.bindings.get('two').db, 'b')
    assert.equal(f.clients[1].disposed, false)
  } finally {
    await f.sessions.stop()
  }
  assert.ok(f.clients.every((v) => v.disposed))
})
test('management reads the live MCP selection rather than the persistent default', async () => {
  const f = fixture()
  try {
    await f.sessions.rebind('one', 'a')
    f.agents.get('one').selected = 'b'
    assert.equal(
      (await f.service.agents()).find((a) => a.id === 'one').index,
      'b',
    )
    assert.equal(f.sessions.bindings.get('one').db, 'a')
    f.agents.get('one').selected = 'removed-externally'
    await assert.rejects(f.service.agents(), /no longer registered/)
  } finally {
    await f.sessions.stop()
  }
})
test('selection inspection retains the tool executor receiver', async () => {
  const f = fixture()
  const tool = {
    selected: 'b',
    async execute() {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify([{ name: this.selected, isActive: true }]),
          },
        ],
      }
    },
  }
  f.ctx.tools.get = () => tool
  try {
    await f.sessions.rebind('one', 'a')
    assert.equal(await f.sessions.currentIndex(f.agents.get('one')), 'b')
  } finally {
    await f.sessions.stop()
  }
})
test('explicit missing defaults never silently select another database', async () => {
  const f = fixture()
  f.service.bindings.one = 'missing'
  await assert.rejects(f.sessions.rebind('one'), /no longer registered/)
  assert.equal(f.clients.length, 0)
  await f.sessions.stop()
})
test('a missing or outdated managed engine leaves sessions available for installation and reconnect', async () => {
  for (const code of ['engine_missing', 'engine_update_required']) {
    const f = fixture()
    const call = f.service.engine.call
    f.service.engine.call = async () => {
      throw Object.assign(new Error('Install engine'), { code })
    }
    try {
      await f.sessions.rebind('one')
      assert.equal(f.clients.length, 0)
      f.service.engine.call = call
      await f.sessions.refresh()
      assert.equal(f.sessions.bindings.size, 2)
    } finally {
      await f.sessions.stop()
    }
  }
})
test('unbind survives refresh and disposal cannot leave a late client alive', async () => {
  const f = fixture()
  await f.sessions.rebind('one', 'a')
  f.service.bindings.one = null
  await f.sessions.rebind('one', null)
  await f.sessions.refresh()
  assert.equal(f.sessions.bindings.has('one'), false)
  let ready
  f.agents.get('one').ctx.plugin = () => ({
    await: () =>
      new Promise((resolve) => {
        ready = resolve
      }),
    dispose: async () => {
      f.lateDisposed = true
    },
  })
  delete f.service.bindings.one
  const attach = f.sessions.rebind('one', 'a')
  await new Promise((r) => setImmediate(r))
  const dispose = f.sessions.disposeAgent(f.agents.get('one'))
  ready()
  await Promise.all([attach, dispose])
  assert.equal(f.lateDisposed, true)
  assert.equal(f.sessions.bindings.has('one'), false)
  await f.sessions.stop()
})
test('a replacement Agent with the same session id reconnects and ignores stale disposal', async () => {
  const f = fixture()
  f.service.bindings.one = 'b'
  try {
    const old = f.agents.get('one')
    await f.sessions.rebind('one')
    await f.sessions.disposeAgent(old)
    const replacement = { ...old }
    f.agents.set('one', replacement)
    await f.sessions.rebind('one')
    assert.equal(f.sessions.bindings.get('one').agent, replacement)
    assert.equal(f.sessions.bindings.get('one').db, 'b')
    await f.sessions.disposeAgent(old)
    assert.equal(f.sessions.bindings.get('one').agent, replacement)
    assert.equal(f.clients.at(-1).disposed, false)
  } finally {
    await f.sessions.stop()
  }
})
test('engine suspension closes every client and restores their durable choices', async () => {
  const f = fixture()
  f.service.bindings = { one: 'a', two: 'b' }
  await f.sessions.refresh()
  await f.sessions.suspend()
  assert.equal(f.sessions.bindings.size, 0)
  await f.sessions.resume()
  assert.equal(f.sessions.bindings.get('one').db, 'a')
  assert.equal(f.sessions.bindings.get('two').db, 'b')
  await f.sessions.stop()
})
test('rebuilding a temporarily selected index reconnects that chat to its durable default', async () => {
  const f = fixture()
  f.service.bindings = { one: 'a', two: 'b' }
  try {
    await f.sessions.refresh()
    const original = f.clients[0]
    f.agents.get('one').selected = 'b'
    await f.sessions.refresh('b')
    assert.equal(original.disposed, true)
    assert.equal(f.sessions.bindings.get('one').db, 'a')
  } finally {
    await f.sessions.stop()
  }
})
test('new chat connections wait for an exclusive registry change', async () => {
  const f = fixture()
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const deleting = f.service.withSelections(() => gate)
  try {
    const connecting = f.sessions.rebind('one', 'a')
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(f.clients.length, 0)
    release()
    await Promise.all([deleting, connecting])
    assert.equal(f.clients.length, 1)
  } finally {
    release()
    await deleting
    await f.sessions.stop()
  }
})

test('engine suspension waits for active query cleanup before closing clients', async () => {
  const f = fixture()
  const started = Promise.withResolvers(),
    release = Promise.withResolvers()
  let querying, suspending
  try {
    await f.sessions.rebind('one', 'a')
    querying = f.sessions.gate.run(false, async () => {
      started.resolve()
      await release.promise
    })
    await started.promise
    suspending = f.sessions.suspend()
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(
      f.clients[0].disposed,
      false,
      'A running query still owns its engine process',
    )
    release.resolve()
    await Promise.all([querying, suspending])
    assert.equal(f.clients[0].disposed, true)
  } finally {
    release.resolve()
    await Promise.allSettled([querying, suspending])
    await f.sessions.stop()
  }
})

test('state inspection keeps its query connection alive until the selection has been read', async () => {
  const f = fixture()
  const reading = Promise.withResolvers(),
    release = Promise.withResolvers()
  f.agents.delete('two')
  f.service.engine.status = async () => ({ ready: false })
  f.service.tasks = { list: () => [] }
  let inspecting, reconnecting
  try {
    await f.sessions.rebind('one', 'a')
    f.ctx.tools.get = () => ({
      execute: async () => {
        reading.resolve()
        await release.promise
        if (f.clients[0].disposed)
          throw new Error('query connection closed during state inspection')
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify([{ name: 'a', isActive: true }]),
            },
          ],
        }
      },
    })
    inspecting = IndexerService.prototype.state.call(f.service)
    inspecting.catch(() => {})
    await reading.promise
    reconnecting = f.sessions.rebind('one', 'b')
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(f.clients[0].disposed, false)
    release.resolve()
    assert.equal((await inspecting).sessions[0].index, 'a')
    await reconnecting
    assert.equal(f.clients[0].disposed, true)
  } finally {
    release.resolve()
    await Promise.allSettled([inspecting, reconnecting])
    await f.sessions.stop()
  }
})

test('cancelling suspension admission preserves in-flight queries and does not reconnect them', async () => {
  const f = fixture()
  const started = Promise.withResolvers(),
    release = Promise.withResolvers()
  const controller = new AbortController()
  let querying
  try {
    await f.sessions.rebind('one', 'a')
    querying = f.sessions.gate.run(false, async () => {
      started.resolve()
      await release.promise
    })
    await started.promise
    const suspending = f.sessions.suspend(controller.signal)
    controller.abort(new DOMException('Cancelled', 'AbortError'))
    await assert.rejects(suspending, { name: 'AbortError' })
    await f.sessions.resume()
    assert.equal(f.clients.length, 1)
    assert.equal(f.clients[0].disposed, false)
  } finally {
    release.resolve()
    await querying
    await f.sessions.stop()
  }
})

test('failed suspension waits for every client cleanup before allowing recovery', async () => {
  const f = fixture()
  const closing = Promise.withResolvers(),
    release = Promise.withResolvers()
  for (const [id, agent] of f.agents) {
    const plugin = agent.ctx.plugin
    agent.ctx.plugin = (...args) => {
      const handle = plugin(...args)
      return {
        ...handle,
        dispose: async () => {
          if (id === 'two') {
            closing.resolve()
            await release.promise
          }
          await handle.dispose()
          if (id === 'one') throw new Error('first client cleanup failed')
        },
      }
    }
  }
  let suspending,
    settled = false
  try {
    await f.sessions.refresh()
    suspending = f.sessions.suspend()
    suspending.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    await closing.promise
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(
      settled,
      false,
      'Recovery must not race another client that is still closing',
    )
    release.resolve()
    await assert.rejects(suspending, /first client cleanup failed/)
    assert.ok(f.clients.every((client) => client.disposed))
  } finally {
    release.resolve()
    await Promise.allSettled([suspending])
    await f.sessions.stop()
  }
})
