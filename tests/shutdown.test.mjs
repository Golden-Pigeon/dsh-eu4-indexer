import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { IndexerService } from '../dist/service.js'
test('unload cancels short management requests and awaits their cleanup', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'e4-shutdown-'))
  let started,
    cleaned = false
  const ready = new Promise((r) => (started = r))
  const engine = {
    call: async (_request, { signal }) => {
      started()
      return new Promise((_resolve, reject) =>
        signal.addEventListener(
          'abort',
          () =>
            setTimeout(() => {
              cleaned = true
              reject(signal.reason)
            }, 15),
          { once: true },
        ),
      )
    },
  }
  const service = new IndexerService({ home, engine })
  await service.init()
  const work = service.dispatch({ operation: 'list' })
  const failure = assert.rejects(work, { name: 'AbortError' })
  await ready
  await service.stop()
  await failure
  assert.equal(cleaned, true)
  await assert.rejects(service.dispatch({ operation: 'list' }), /shutting down/)
  await rm(home, { recursive: true, force: true })
})
