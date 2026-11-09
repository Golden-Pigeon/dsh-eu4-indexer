import test from 'node:test'
import assert from 'node:assert/strict'
import { SelectionGate } from '../dist/integration/selection-gate.js'
const deferred = () => {
  let resolve
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}
test('parallel queries settle before deletion; later selection changes cannot overtake deletion', async () => {
  const gate = new SelectionGate(),
    readers = deferred(),
    writer = deferred(),
    order = []
  const read = (id) =>
    gate.run(false, async () => {
      order.push(id)
      await readers.promise
    })
  const a = read('query-a'),
    b = read('query-b')
  await new Promise((r) => setImmediate(r))
  const remove = gate.run(true, async () => {
    order.push('remove')
    await writer.promise
  })
  const change = gate.run(true, async () => {
    order.push('select')
  })
  const c = gate.run(false, async () => {
    order.push('query-c')
  })
  assert.deepEqual(order, ['query-a', 'query-b'])
  readers.resolve()
  await Promise.all([a, b])
  await new Promise((r) => setImmediate(r))
  assert.deepEqual(order, ['query-a', 'query-b', 'remove'])
  writer.resolve()
  await Promise.all([remove, change, c])
  assert.deepEqual(order, ['query-a', 'query-b', 'remove', 'select', 'query-c'])
})
test('cancelled queue entries and failed operations release admission', async () => {
  const gate = new SelectionGate(),
    active = deferred(),
    started = deferred(),
    cancel = new AbortController()
  const reading = gate.run(false, async () => {
    started.resolve()
    await active.promise
  })
  await started.promise
  const pending = gate.run(
    true,
    () => assert.fail('cancelled writer ran'),
    cancel.signal,
  )
  const rejected = assert.rejects(pending, { name: 'AbortError' })
  cancel.abort()
  await rejected
  await gate.run(false, async () => {})
  active.resolve()
  await reading
  await assert.rejects(
    gate.run(true, async () => {
      throw Error('failure')
    }),
    /failure/,
  )
  await gate.run(true, async () => {})
})
