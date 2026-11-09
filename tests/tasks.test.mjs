import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Tasks } from '../dist/indexing/tasks.js'
const tick = () => new Promise((resolve) => setTimeout(resolve, 10))
async function terminal(tasks, id) {
  for (let n = 0; n < 200; n++) {
    const row = tasks.list().find((t) => t.id === id)
    if (!['running', 'queued', 'cancelling'].includes(row.state)) return row
    await tick()
  }
  throw new Error('Task did not finish')
}
test('prototype completion hooks are awaited before a task succeeds', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'e4-completion-'))
  const entered = Promise.withResolvers(),
    release = Promise.withResolvers()
  let completed
  class ConnectedTasks extends Tasks {
    async onCompleted(task) {
      entered.resolve()
      await release.promise
      completed = task.result
    }
  }
  const tasks = new ConnectedTasks(home)
  try {
    await tasks.init()
    const row = await tasks.start('index', 'base', {}, async () => ({
      name: 'base',
    }))
    // A shadowed hook would let the task finish without reconnecting clients.
    await Promise.race([
      entered.promise,
      terminal(tasks, row.id).then(() =>
        assert.fail('Completion hook was skipped'),
      ),
    ])
    assert.equal(tasks.list()[0].state, 'running')
    release.resolve()
    assert.equal((await terminal(tasks, row.id)).state, 'succeeded')
    assert.deepEqual(completed, { name: 'base' })
  } finally {
    release.resolve()
    await tasks.stop()
    await rm(home, { recursive: true, force: true })
  }
})
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
for (const action of ['cancel', 'stop'])
  test(`${action} during initial journal persistence cannot leave queued or running work`, async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'e4-admission-'))
    const tasks = new Tasks(home)
    await tasks.init()
    let release,
      ran = false
    tasks.writes = new Promise((resolve) => {
      release = resolve
    })
    try {
      const starting = tasks.start('index', 'a', {}, async () => {
        ran = true
      })
      const id = tasks.list()[0].id
      const ending = action === 'cancel' ? tasks.cancel(id) : tasks.stop()
      release()
      await Promise.all([starting, ending])
      assert.equal(ran, false)
      assert.equal(
        tasks.list()[0].state,
        action === 'cancel' ? 'cancelled' : 'interrupted',
      )
    } finally {
      release()
      await tasks.stop()
      await rm(home, { recursive: true, force: true })
    }
  })
test('cancellation while the running state is being persisted does not invoke work with an aborted signal', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'e4-start-cancel-'))
  const tasks = new Tasks(home)
  await tasks.init()
  let release,
    ran = false
  const originalSave = tasks.save.bind(tasks)
  tasks.save = () => {
    if (tasks.list()[0]?.state === 'running')
      tasks.writes = new Promise((resolve) => {
        release = resolve
      })
    return originalSave()
  }
  try {
    const task = await tasks.start('index', 'a', {}, async () => {
      ran = true
    })
    const cancel = tasks.cancel(task.id)
    release()
    await cancel
    assert.equal((await terminal(tasks, task.id)).state, 'cancelled')
    assert.equal(ran, false)
  } finally {
    release?.()
    await tasks.stop()
    await rm(home, { recursive: true, force: true })
  }
})
