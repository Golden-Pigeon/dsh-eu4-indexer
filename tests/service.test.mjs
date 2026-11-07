import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { IndexerService } from '../src/service.js'
import { createApi } from '../src/integration/http.js'
import { sessionId, indexName, cleanEnv } from '../src/util.js'
async function fixture() {
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
  const service = new IndexerService({ home, engine })
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
