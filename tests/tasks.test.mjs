import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Tasks } from '../src/indexing/tasks.js'
const tick = () => new Promise((resolve) => setTimeout(resolve, 10))
async function terminal(tasks, id) {
  for (let n = 0; n < 200; n++) {
    const row = tasks.list().find((t) => t.id === id)
    if (!['running', 'queued', 'cancelling'].includes(row.state)) return row
    await tick()
  }
  throw new Error('Task did not finish')
}
test('tasks serialize conflicting writes, queue unrelated work, and persist terminal results', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'e4-tasks-')),
    tasks = new Tasks(home, { concurrency: 1 })
  await tasks.init()
  let release
  const gate = new Promise((r) => (release = r))
  try {
    const first = await tasks.start('index', 'same', {}, async () => {
      await gate
      return { ok: true }
    })
    await assert.rejects(
      tasks.start('refresh', 'same', {}, async () => {}),
      /already/,
    )
    const second = await tasks.start('index', 'other', {}, async () => ({
      ok: 2,
    }))
    assert.equal(second.state, 'queued')
    release()
    assert.equal((await terminal(tasks, first.id)).state, 'succeeded')
    assert.equal((await terminal(tasks, second.id)).result.ok, 2)
    await tasks.stop()
    const persisted = JSON.parse(
      await readFile(path.join(home, 'tasks.json'), 'utf8'),
    )
    assert.ok(persisted.every((t) => t.state === 'succeeded'))
  } finally {
    release?.()
    await tasks.stop()
    await rm(home, { recursive: true, force: true })
  }
})
test('queued cancellation never starts work and running cancellation waits for cleanup', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'e4-cancel-')),
    tasks = new Tasks(home, { concurrency: 1 })
  await tasks.init()
  let cleaned = false,
    started = false
  try {
    const first = await tasks.start(
      'index',
      'a',
      {},
      (signal) =>
        new Promise((_, reject) =>
          signal.addEventListener(
            'abort',
            () =>
              setTimeout(() => {
                cleaned = true
                reject(signal.reason)
              }, 20),
            { once: true },
          ),
        ),
    )
    const second = await tasks.start('index', 'b', {}, async () => {
      started = true
    })
    await tasks.cancel(second.id)
    await tasks.cancel(first.id)
    assert.equal((await terminal(tasks, first.id)).state, 'cancelled')
    assert.equal(cleaned, true)
    assert.equal(started, false)
  } finally {
    await tasks.stop()
    await rm(home, { recursive: true, force: true })
  }
})
test('host restart marks unfinished tasks interrupted', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'e4-restart-'))
  await writeFile(
    path.join(home, 'tasks.json'),
    JSON.stringify([{ id: 'old', state: 'running' }]),
  )
  const tasks = new Tasks(home)
  await tasks.init()
  assert.equal(tasks.list()[0].state, 'interrupted')
  await tasks.stop()
  await rm(home, { recursive: true, force: true })
})
