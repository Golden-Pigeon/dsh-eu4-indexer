import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { IndexerService } from '../dist/service.js'
import { Engine } from '../dist/engine/runtime.js'
import { createApi } from '../dist/integration/http.js'
import { sessionId, indexName, cleanEnv } from '../dist/util.js'
async function fixture(Service = IndexerService) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'e4-service-'))
  const engine = {
    status: async () => ({ ready: true }),
    call: async (r) =>
      r.operation === 'list'
        ? {
            activeDb: '',
            databases: [
              { name: 'eu4-a', path: '/a' },
              { name: 'hoi4-b', path: '/b' },
            ],
          }
        : { games: [] },
  }
  const service = new Service({ home, engine })
  await service.init()
  return {
    service,
    home,
    stop: async () => {
      await service.stop()
      await rm(home, { recursive: true, force: true })
    },
  }
}
test('engine configuration keeps prototype suspension and resume hooks', async (t) => {
  const calls = []
  class ConnectedService extends IndexerService {
    async onEngineChanging() {
      await new Promise((resolve) => setImmediate(resolve))
      calls.push('suspend')
    }
    async onEngineChanged() {
      calls.push('resume')
    }
  }
  const f = await fixture(ConnectedService)
  t.mock.method(Engine.prototype, 'status', async () => ({ ready: true }))
  try {
    await f.service.dispatch({
      operation: 'configure',
      executablePath: '/new-engine',
    })
    assert.deepEqual(calls, ['suspend', 'resume'])
    assert.equal(f.service.engine.explicit, path.resolve('/new-engine'))
  } finally {
    await f.stop()
  }
})
test('session defaults are independent and survive a service restart', async () => {
  const f = await fixture()
  try {
    await f.service.bind('a', 'eu4-a')
    await f.service.bind('b', 'hoi4-b')
    assert.equal(await f.service.binding('a'), 'eu4-a')
    assert.equal(await f.service.binding('b'), 'hoi4-b')
    const copy = new IndexerService({ home: f.home, engine: f.service.engine })
    await copy.init()
    assert.equal(await copy.binding('a'), 'eu4-a')
    await copy.stop()
  } finally {
    await f.stop()
  }
})
test('failed connection binding does not save the new selection', async () => {
  const f = await fixture()
  try {
    await f.service.bind('a', 'eu4-a')
    f.service.onBinding = async () => {
      throw new Error('Could not connect')
    }
    await assert.rejects(f.service.bind('a', 'hoi4-b'), /connect/)
    assert.equal(await f.service.binding('a'), 'eu4-a')
  } finally {
    await f.stop()
  }
})
test('model binding uses its executing session and removal refuses selected indexes', async () => {
  const f = await fixture()
  try {
    await f.service.dispatch(
      { operation: 'bind', sessionId: 'other', name: 'eu4-a' },
      { currentSession: 'own' },
    )
    assert.equal(await f.service.binding('own'), 'eu4-a')
    assert.equal(await f.service.binding('other'), '')
    await assert.rejects(
      f.service.dispatch({ operation: 'remove', name: 'eu4-a' }),
      /selected/,
    )
  } finally {
    await f.stop()
  }
})
test('management route validates method, JSON content and malformed requests', async () => {
  const f = await fixture()
  try {
    const api = createApi(f.service)
    assert.equal(
      (
        await api(
          new Request('http://localhost/api/eu4-indexer', { method: 'PUT' }),
        )
      ).status,
      405,
    )
    assert.equal(
      (
        await api(
          new Request('http://localhost/api/eu4-indexer', {
            method: 'POST',
            body: '{}',
          }),
        )
      ).status,
      415,
    )
    assert.equal(
      (
        await api(
          new Request('http://localhost/api/eu4-indexer', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{',
          }),
        )
      ).status,
      400,
    )
    assert.equal(
      (await api(new Request('http://localhost/api/eu4-indexer'))).status,
      200,
    )
  } finally {
    await f.stop()
  }
})
test('register refreshes clients only after success and cannot overwrite an active build', async () => {
  const f = await fixture()
  const registered = []
  const release = Promise.withResolvers()
  let imports = 0
  f.service.onRegistered = async (name) => registered.push(name)
  f.service.engine.call = async (r) => {
    if (r.operation === 'index') return release.promise
    if (r.operation === 'register') {
      imports++
      if (r.path === '/invalid') throw new Error('Invalid database')
      return { name: r.name, path: r.path }
    }
    return {}
  }
  try {
    await f.service.dispatch({
      operation: 'register',
      name: 'eu4-a',
      path: '/new',
    })
    assert.deepEqual(registered, ['eu4-a'])
    await assert.rejects(
      f.service.dispatch({
        operation: 'register',
        name: 'eu4-a',
        path: '/invalid',
      }),
      /Invalid database/,
    )
    assert.deepEqual(registered, ['eu4-a'])
    const task = await f.service.dispatch({
      operation: 'index',
      name: 'eu4-a',
      game: 'eu4',
    })
    await assert.rejects(
      f.service.dispatch({
        operation: 'register',
        name: 'eu4-a',
        path: '/replacement',
      }),
      { code: 'busy' },
    )
    assert.equal(imports, 2)
    await f.service.dispatch({
      operation: 'register',
      name: 'other',
      path: '/other',
    })
    const done = f.service.tasks.running.get(task.id).done
    release.resolve({})
    await done
    await f.service.dispatch({
      operation: 'register',
      name: 'eu4-a',
      path: '/replacement',
    })
    assert.deepEqual(registered, ['eu4-a', 'other', 'eu4-a'])
  } finally {
    release.resolve({})
    await f.stop()
  }
})
test('identifiers reject path traversal and control characters', () => {
  assert.throws(() => indexName('../oops'))
  assert.throws(() => sessionId('a\nb'))
  assert.equal(indexName('eu4-vanilla'), 'eu4-vanilla')
})
test('ambient credentials are excluded from engine processes', () => {
  process.env.E4_TEST_SECRET = 'private'
  try {
    assert.equal(cleanEnv().E4_TEST_SECRET, undefined)
    assert.equal(
      cleanEnv({ EU4INDEXER_HOME: '/tmp/test' }).EU4INDEXER_HOME,
      '/tmp/test',
    )
  } finally {
    delete process.env.E4_TEST_SECRET
  }
})

test('an engine configuration probe cannot overlap a newly admitted index task', async (t) => {
  const f = await fixture()
  const probe = Promise.withResolvers(),
    release = Promise.withResolvers()
  t.mock.method(Engine.prototype, 'status', async () => {
    probe.resolve()
    await release.promise
    return { ready: true }
  })
  const configuring = f.service.dispatch({
    operation: 'configure',
    executablePath: '/new-engine',
  })
  let indexing
  try {
    await probe.promise
    indexing = f.service.dispatch({
      operation: 'index',
      game: 'eu4',
      name: 'new-index',
    })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(
      f.service.tasks.list().length,
      0,
      'Do not start a build against an engine that is changing',
    )
    release.resolve()
    await Promise.all([configuring, indexing])
  } finally {
    release.resolve()
    await Promise.allSettled([configuring, indexing])
    await f.stop()
  }
})

test('a failed engine suspension preserves the saved engine and resumes connections', async (t) => {
  const f = await fixture()
  t.mock.method(Engine.prototype, 'status', async () => ({ ready: true }))
  f.service.engine.explicit = '/original-engine'
  await writeFile(
    path.join(f.home, 'settings.json'),
    JSON.stringify({ executablePath: '/original-engine' }),
  )
  let resumed = false
  f.service.onEngineChanging = async () => {
    throw new Error('suspension failed')
  }
  f.service.onEngineChanged = async () => {
    resumed = true
  }
  try {
    await assert.rejects(
      f.service.dispatch({
        operation: 'configure',
        executablePath: '/new-engine',
      }),
      /suspension failed/,
    )
    assert.equal(f.service.engine.explicit, '/original-engine')
    assert.equal(
      JSON.parse(await readFile(path.join(f.home, 'settings.json')))
        .executablePath,
      '/original-engine',
    )
    assert.equal(resumed, true)
  } finally {
    await f.stop()
  }
})

test('removed management operations are rejected', async () => {
  const f = await fixture()
  try {
    for (const operation of ['install_engine', 'setup'])
      await assert.rejects(
        f.service.dispatch({ operation }),
        /Unknown management operation/,
      )
  } finally {
    await f.stop()
  }
})
