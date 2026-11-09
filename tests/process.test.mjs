import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, chmod, rm, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { manage } from '../dist/engine/process.js'
async function fixture(source) {
  const home = await mkdtemp(path.join(os.tmpdir(), 'e4-runner-')),
    exe = path.join(home, 'fake')
  await writeFile(exe, `#!${process.execPath}\n${source}`)
  await chmod(exe, 0o755)
  return {
    home,
    exe,
    cleanup: () => rm(home, { recursive: true, force: true }),
  }
}
const result = (value) =>
  JSON.stringify({ apiVersion: 1, type: 'result', data: value })
test('runner consumes fragmented records and preserves the exact terminal result', {skip:process.platform==='win32'}, async () => {
  const f = await fixture(
    `process.stdin.resume();process.stdout.write('${result({ ok: true }).slice(0, 20)}');setTimeout(()=>process.stdout.end('${result({ ok: true }).slice(20)}\\n'),10)`,
  )
  try {
    assert.deepEqual(await manage(f.exe, f.home, {}), { ok: true })
  } finally {
    await f.cleanup()
  }
})
test('runner rejects protocol corruption, engine errors and missing terminal responses', {skip:process.platform==='win32'}, async () => {
  for (const source of [
    `console.log('not-json')`,
    `console.log('${JSON.stringify({ apiVersion: 1, type: 'error', data: { code: 'bad', message: 'Expected error' } })}');process.exitCode=1`,
    `process.exitCode=0`,
  ]) {
    const f = await fixture(source)
    try {
      await assert.rejects(manage(f.exe, f.home, {}))
    } finally {
      await f.cleanup()
    }
  }
})
test('cancellation waits for actual child cleanup before settling', {skip:process.platform==='win32'}, async () => {
  const f = await fixture(
    `import fs from 'node:fs';process.stdin.resume();process.on('SIGTERM',()=>setTimeout(()=>{fs.writeFileSync(process.env.EU4INDEXER_HOME+'/stopped','yes');process.exit(0)},60));console.log('${JSON.stringify({ apiVersion: 1, type: 'log', data: { message: 'ready' } })}');setInterval(()=>{},1000)`,
  )
  const controller = new AbortController()
  try {
    const pending = manage(
      f.exe,
      f.home,
      {},
      { signal: controller.signal, onEvent: () => controller.abort() },
    )
    await assert.rejects(pending, { name: 'AbortError' })
    assert.equal(await readFile(path.join(f.home, 'stopped'), 'utf8'), 'yes')
  } finally {
    await f.cleanup()
  }
})
test('deadline kills a hung engine rather than leaving a child behind', {skip:process.platform==='win32'}, async () => {
  const f = await fixture('process.stdin.resume();setInterval(()=>{},1000)')
  try {
    await assert.rejects(manage(f.exe, f.home, {}, { timeoutMs: 40 }), {
      code: 'timeout',
    })
  } finally {
    await f.cleanup()
  }
})
