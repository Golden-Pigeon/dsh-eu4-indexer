import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { copyFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { Engine } from '../../src/engine/runtime.js'
const root = path.resolve(import.meta.dirname, '../..'),
  upstream = path.join(root, 'external/eu4-indexer')
const executable =
  process.env.DSH_EU4_ENGINE ??
  path.join(
    upstream,
    'Eu4Indexer.Cli/bin/Debug/net9.0',
    process.platform === 'win32' ? 'eu4indexer.exe' : 'eu4indexer',
  )
function client(home, args = []) {
  const child = spawn(executable, ['serve', ...args], {
    env: { ...process.env, EU4INDEXER_HOME: home },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let id = 0,
    stderr = ''
  const waiting = new Map()
  child.stderr.on('data', (c) => {
    stderr += c
  })
  createInterface({ input: child.stdout }).on('line', (line) => {
    const message = JSON.parse(line)
    if (message.id != null) {
      const pending = waiting.get(message.id)
      if (pending) {
        waiting.delete(message.id)
        message.error
          ? pending.reject(new Error(JSON.stringify(message.error)))
          : pending.resolve(message.result)
      }
    }
  })
  child.on('close', () => {
    for (const pending of waiting.values())
      pending.reject(new Error(`MCP closed: ${stderr}`))
  })
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const key = ++id
      waiting.set(key, { resolve, reject })
      child.stdin.write(
        JSON.stringify({ jsonrpc: '2.0', id: key, method, params }) + '\n',
      )
    })
  return {
    request,
    call: (name, args = {}, session) =>
      request('tools/call', {
        name,
        arguments: args,
        ...(session ? { _meta: { 'eu4indexer/sessionId': session } } : {}),
      }),
    init: async () => {
      await request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'isolation-test', version: '1' },
      })
      child.stdin.write(
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        }) + '\n',
      )
    },
    stop: () =>
      new Promise((resolve) => {
        child.once('close', resolve)
        child.stdin.end()
      }),
  }
}
function decoded(result) {
  assert.notEqual(result.isError, true, JSON.stringify(result))
  if (result.structuredContent) return result.structuredContent
  const text = result.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('')
  return JSON.parse(text)
}
test(
  'management + real MCP: versioned builds, preservation on failure, import, session isolation',
  { timeout: 180000 },
  async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'dsh-eu4-e2e-')),
      engine = new Engine({ home, executablePath: executable }),
      clients = []
    try {
      assert.equal((await engine.status()).ready, true)
      for (const game of ['eu4', 'hoi4']) {
        const output = await engine.call({
          operation: 'index',
          game,
          name: game,
          gameDir: path.join(
            upstream,
            'Eu4Indexer.Tests/fixtures',
            game,
            'example-game',
          ),
          configDir:
            process.env[game.toUpperCase() + '_CONFIG_DIR'] ??
            path.join(os.homedir(), '.eu4indexer/config', game),
          languages: ['english'],
        })
        assert.equal(output.report.foreignKeyViolations, 0)
        assert.ok(output.report.entityCount > 0)
      }
      const original = (
        await engine.call({ operation: 'list' })
      ).databases.find((db) => db.name === 'eu4').path
      const refresh = await engine.call({ operation: 'refresh', name: 'eu4' })
      assert.notEqual(refresh.index.path, original)
      await access(original)
      await assert.rejects(
        engine.call({
          operation: 'index',
          name: 'eu4',
          gameDir: '/does-not-exist',
        }),
      )
      assert.equal(
        (await engine.call({ operation: 'list' })).databases.find(
          (db) => db.name === 'eu4',
        ).path,
        refresh.index.path,
      )
      const info = await engine.call({ operation: 'inspect', name: 'eu4' })
      assert.equal(info.meta.game_id, 'eu4')
      assert.equal(info.parseErrorCount, 0)
      const invalidPath = path.join(home, 'diagnostics.db')
      await copyFile(original, invalidPath)
      const diagnostics = new DatabaseSync(invalidPath)
      for (let i = 0; i < 150; i++)
        diagnostics.exec(
          "INSERT INTO parse_errors(file_id,message,line,col) VALUES((SELECT file_id FROM files LIMIT 1),'Synthetic diagnostic',NULL,NULL)",
        )
      diagnostics.close()
      const page = await engine.call({
        operation: 'inspect',
        path: invalidPath,
        errorOffset: 100,
      })
      assert.equal(page.parseErrors.length, 50)
      assert.equal(page.parseErrors[0].line, null)
      assert.equal(page.hasMoreErrors, false)
      await engine.call({
        operation: 'register',
        name: 'external',
        path: invalidPath,
      })
      await assert.rejects(
        engine.call({
          operation: 'remove',
          name: 'external',
          deleteFile: true,
        }),
        /only be unregistered/,
      )
      assert.ok(
        (await engine.call({ operation: 'list' })).databases.some(
          (db) => db.name === 'external',
        ),
      )
      await engine.call({ operation: 'remove', name: 'external' })
      const controller = new AbortController()
      await assert.rejects(
        engine.call(
          { operation: 'refresh', name: 'eu4' },
          {
            signal: controller.signal,
            onEvent: (event) => {
              if (event.type === 'progress') controller.abort()
            },
          },
        ),
        { name: 'AbortError' },
      )
      assert.equal(
        (await engine.call({ operation: 'list' })).databases.find(
          (db) => db.name === 'eu4',
        ).path,
        refresh.index.path,
      )
      await engine.call({
        operation: 'register',
        name: 'imported',
        path: original,
      })
      await engine.call({ operation: 'remove', name: 'imported' })
      await access(original)
      const c = client(home, [
        '--db',
        refresh.index.path,
        '--query-session',
        'default',
      ])
      clients.push(c)
      await c.init()
      assert.match(
        JSON.stringify(
          await c.call('select_database', { name: 'hoi4' }, 'one'),
        ),
        /Selected/,
      )
      assert.equal(
        decoded(await c.call('list_databases', {}, 'one')).find(
          (d) => d.isActive,
        ).name,
        'hoi4',
      )
      assert.equal(
        decoded(await c.call('list_databases', {}, 'two')).find(
          (d) => d.isActive,
        ).name,
        'eu4',
      )
      assert.equal(
        decoded(await c.call('list_databases')).find((d) => d.isActive).name,
        'eu4',
      )
      await c.call('select_database', { name: 'hoi4' })
      assert.equal(
        decoded(await c.call('list_databases')).find((d) => d.isActive).name,
        'hoi4',
      )
      assert.equal(
        decoded(await c.call('list_databases', {}, 'fresh')).find(
          (d) => d.isActive,
        ).name,
        'eu4',
      )
      await Promise.all(
        Array.from({ length: 16 }, async (_, i) => {
          const id = 'parallel-' + i,
            name = i % 2 ? 'hoi4' : 'eu4'
          await c.call('select_database', { name }, id)
          const dbs = decoded(await c.call('list_databases', {}, id))
          assert.equal(dbs.find((d) => d.isActive).name, name)
          const query = decoded(
            await c.call(
              'read_query',
              { sql: "SELECT value FROM meta WHERE key='game_id'" },
              id,
            ),
          )
          assert.ok(JSON.stringify(query).includes(name))
        }),
      )
      await c.call('close_query_session', { sessionId: 'one' })
      assert.equal(
        decoded(await c.call('list_databases', {}, 'one')).find(
          (d) => d.isActive,
        ).name,
        'eu4',
      )
      const legacy = client(home, ['--db', refresh.index.path])
      clients.push(legacy)
      await legacy.init()
      await legacy.call('select_database', { name: 'hoi4' })
      assert.equal(
        decoded(await legacy.call('list_databases')).find((d) => d.isActive)
          .name,
        'hoi4',
      )
      const invalid = await c.call('list_databases', {}, 'bad\nname')
      assert.equal(invalid.isError, true)
    } finally {
      await Promise.all(clients.map((c) => c.stop()))
      await rm(home, { recursive: true, force: true })
    }
  },
)
