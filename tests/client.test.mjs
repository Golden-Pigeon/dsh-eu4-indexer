import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { Context } from '@deepseek-ai/cordis'
const script = await readFile(
  new URL('../dist/client/client.js', import.meta.url),
  'utf8',
)
test('compiled TSX can be evaluated repeatedly in the same browser global', () => {
  const entries = []
  const browser = vm.createContext({
    window: { __ModuleLoader__: { load: (entry) => entries.push(entry) } },
  })
  for (let cycle = 0; cycle < 2; cycle++) vm.runInContext(script, browser)
  assert.equal(entries.length, 2)
  for (const entry of entries) {
    assert.equal(entry.id, '@goldenpigeon/dsh-eu4-indexer')
    assert.equal(
      typeof entry.factory((name) => (name === 'react' ? React : undefined))
        .Page,
      'function',
    )
  }
})
test('browser entry registers both slots and drives build, bind, unbind, cancellation and pagination', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' }),
    previous = { window: globalThis.window, document: globalThis.document }
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  let entry
  vm.runInNewContext(script, {
    window: {
      __ModuleLoader__: {
        load(value) {
          entry = value.factory((n) => (n === 'react' ? React : undefined))
        },
      },
    },
    AbortController,
    setTimeout,
    clearTimeout,
  })
  const requests = [],
    slots = [],
    state = {
      engine: { ready: true, executable: '/engine' },
      home: '/data',
      registry: {
        databases: [
          {
            name: 'base',
            game: 'eu4',
            sources: 1,
            indexedAt: '2026-11-07',
            path: '/db',
          },
        ],
      },
      tasks: [
        {
          id: 'job',
          kind: 'index',
          state: 'running',
          input: { name: 'base' },
          createdAt: '2026-11-07',
          events: [],
        },
      ],
      bindings: { one: 'base' },
      sessions: [{ id: 'one', title: 'Chat one' }],
      environment: { games: [{ game: 'eu4', configReady: true }] },
    }
  let previewResult, choicesResult
  const ctx = {
    effect: (setup) => setup(),
    locale: {
      register(_name, values) {
        this.values = values
      },
      bind() {
        return (key) => this.values.en[key] ?? key
      },
    },
    connection: {
      rpc: {
        call: async (_route, _endpoint, request) => {
          requests.push(request)
          if (request.operation === 'detect' && previewResult)
            return { ok: true, value: await previewResult }
          if (
            ['workshop', 'playsets'].includes(request.operation) &&
            choicesResult
          )
            return { ok: true, value: (await choicesResult)[request.operation] }
          return {
            ok: true,
            value:
              request.operation === 'state'
                ? state
                : request.operation === 'inspect'
                  ? {
                      path: '/db',
                      parseErrorCount: 150,
                      parseErrors: [],
                      errorOffset: request.errorOffset ?? 0,
                      errorLimit: 100,
                      hasMoreErrors: !request.errorOffset,
                    }
                  : { id: 'job' },
          }
        },
      },
    },
    slots: {
      inject(_name, callback) {
        callback()
      },
      register(options, view) {
        slots.push({ options, view })
      },
    },
  }
  entry.apply(ctx)
  assert.equal(slots.length, 2)
  const manifest = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url)),
  )
  assert.deepEqual(
    slots.map(({ options }) => options.key),
    [manifest.name, `${manifest.name}#eu4-indexer`],
  )
  const root = createRoot(document.getElementById('root'))
  const settle = async (fn) => {
    await act(async () => {
      await fn?.()
      await new Promise((r) => setImmediate(r))
    })
  }
  const button = (label) =>
    [...document.querySelectorAll('button')].find(
      (e) => e.textContent === label,
    )
  const click = async (label) => {
    const found = button(label)
    assert.ok(found, `Missing button: ${label}`)
    await settle(() => found.click())
  }
  try {
    await settle(() =>
      root.render(React.createElement(slots[0].view, { view: 'page' })),
    )
    assert.match(document.body.textContent, /Game script indexes/)
    assert.match(document.body.textContent, /Choose a session/)
    assert.doesNotMatch(document.body.textContent, /No loaded sessions/)
    await click('Details')
    await click('Next')
    assert.ok(
      requests.some((r) => r.operation === 'inspect' && r.errorOffset === 100),
    )
    await settle(() => {
      const selects = document.querySelectorAll('select')
      selects[0].value = 'one'
      selects[0].dispatchEvent(new window.Event('change', { bubbles: true }))
    })
    await click('Set session default')
    assert.ok(
      requests.some(
        (r) =>
          r.operation === 'bind' && r.sessionId === 'one' && r.name === 'base',
      ),
    )
    await click('Unbind')
    assert.ok(
      requests.some((r) => r.operation === 'unbind' && r.sessionId === 'one'),
    )
    await click('Build index')
    await click('Build / rebuild index')
    assert.ok(requests.some((r) => r.operation === 'index' && r.game === 'eu4'))
    let finishPreview
    previewResult = new Promise((resolve) => {
      finishPreview = resolve
    })
    await click('Build index')
    await click('Preview resolved sources')
    await settle(() => {
      const game = document.querySelector('.e4 select')
      game.value = 'hoi4'
      game.dispatchEvent(new window.Event('change', { bubbles: true }))
    })
    await settle(() => finishPreview({ game: 'eu4', gameDir: '/old-game' }))
    assert.doesNotMatch(document.body.textContent, /Resolved sources/)
    previewResult = Promise.resolve({ game: 'hoi4', gameDir: '/current-game' })
    await click('Preview resolved sources')
    assert.match(document.body.textContent, /current-game/)
    await settle(() => {
      const game = document.querySelector('.e4 select')
      game.value = 'eu4'
      game.dispatchEvent(new window.Event('change', { bubbles: true }))
    })
    assert.doesNotMatch(document.body.textContent, /Resolved sources/)
    let finishChoices
    choicesResult = new Promise((resolve) => {
      finishChoices = resolve
    })
    await click('Load mod choices')
    await settle(() => {
      const game = document.querySelector('.e4 select')
      game.value = 'hoi4'
      game.dispatchEvent(new window.Event('change', { bubbles: true }))
    })
    await settle(() =>
      finishChoices({
        workshop: [{ workshopId: 'old-eu4', name: 'Old EU4 mod' }],
        playsets: [{ id: 'old-playset', name: 'Old EU4 playset' }],
      }),
    )
    assert.doesNotMatch(document.body.textContent, /Old EU4/)
    choicesResult = Promise.resolve({
      workshop: [{ workshopId: 'new-hoi4', name: 'Current HOI4 mod' }],
      playsets: [],
    })
    await click('Load mod choices')
    assert.match(document.body.textContent, /Current HOI4 mod/)
    await click('Background tasks •')
    await click('Cancel')
    assert.ok(
      requests.some((r) => r.operation === 'cancel_task' && r.taskId === 'job'),
    )
    await click('Engine & settings')
    assert.match(document.body.textContent, /Available rules/)
  } finally {
    await settle(() => root.unmount())
    dom.window.close()
    globalThis.window = previous.window
    globalThis.document = previous.document
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
  }
})

test('browser dictionaries are released on unload and can be registered on re-enable', async () => {
  let entry
  vm.runInNewContext(script, {
    window: {
      __ModuleLoader__: {
        load(value) {
          entry = value.factory((name) =>
            name === 'react' ? React : undefined,
          )
        },
      },
    },
  })
  const ctx = new Context(),
    dictionaries = new Map()
  ctx.provide('locale', {
    register(namespace, values) {
      assert.equal(
        dictionaries.has(namespace),
        false,
        'dictionary was not released',
      )
      dictionaries.set(namespace, values)
      return () => dictionaries.delete(namespace)
    },
    bind: () => (key) => dictionaries.get('eu4Indexer').en[key] ?? key,
  })
  ctx.provide('slots', {
    inject: (_name, register) => register(),
    register: () => () => {},
  })
  ctx.provide('connection', {})
  try {
    for (let cycle = 0; cycle < 3; cycle++) {
      const handle = ctx.plugin(entry)
      await handle.await()
      assert.equal(dictionaries.size, 1)
      await handle.dispose()
      assert.equal(dictionaries.size, 0)
    }
  } finally {
    await ctx.fiber.dispose()
  }
})
