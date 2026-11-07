import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
const script = await readFile(
  new URL('../src/client/client.js', import.meta.url),
  'utf8',
)
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
  const ctx = {
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
