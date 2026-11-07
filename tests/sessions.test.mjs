import test from 'node:test'
import assert from 'node:assert/strict'
import { SessionConnections } from '../src/integration/sessions.js'
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
  }
  return {
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
test('explicit missing defaults never silently select another database', async () => {
  const f = fixture()
  f.service.bindings.one = 'missing'
  await assert.rejects(f.sessions.rebind('one'), /no longer registered/)
  assert.equal(f.clients.length, 0)
  await f.sessions.stop()
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
  const dispose = f.sessions.disposeAgent('one')
  ready()
  await Promise.all([attach, dispose])
  assert.equal(f.lateDisposed, true)
  assert.equal(f.sessions.bindings.has('one'), false)
  await f.sessions.stop()
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
