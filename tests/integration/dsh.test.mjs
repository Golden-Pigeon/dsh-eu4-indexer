import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import Skills from '@deepseek-ai/dsh-skill'
import { createScope } from '@deepseek-ai/dsh-scope'
import * as Plugin from '../../src/index.js'
import { Engine } from '../../src/engine/runtime.js'
const upstream = path.resolve(import.meta.dirname, '../../external/eu4-indexer')
const executable =
  process.env.DSH_EU4_ENGINE ??
  path.join(
    upstream,
    'Eu4Indexer.Cli/bin/Debug/net9.0',
    process.platform === 'win32' ? 'eu4indexer.exe' : 'eu4indexer',
  )
const texts = (result) =>
  result.content
    .filter((v) => v.type === 'text')
    .map((v) => v.text)
    .join('')
test(
  'official Cordis + MCP client: scoped tools, owner RPC, skills and unload',
  { timeout: 60000 },
  async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'dsh-host-e2e-')),
      engine = new Engine({ home, executablePath: executable }),
      ctx = new Context(),
      handles = [],
      scopes = []
    let rpc
    try {
      for (const game of ['eu4', 'hoi4'])
        await engine.call({
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
        })
      handles.push(ctx.plugin(SystemPrompt))
      await handles.at(-1).await()
      handles.push(ctx.plugin(Tools))
      await handles.at(-1).await()
      const agents = new Map()
      ctx.provide('agents', {
        list: () => [...agents.values()],
        get: (id) => agents.get(id),
      })
      handles.push(ctx.plugin(Skills))
      await handles.at(-1).await()
      const disposeConnection = ctx.provide('connection', {
        rpc: {
          intercept(route, predicate, handler) {
            assert.equal(route, '/api')
            assert.equal(predicate('eu4-indexer/dispatch'), true)
            rpc = handler
            return () => {
              rpc = null
            }
          },
        },
      })
      for (const id of ['one', 'two']) {
        const agent = { id }
        const scope = createScope(ctx, agent)
        scopes.push(scope)
        agent.ctx = scope.ctx
        agents.set(id, agent)
      }
      const plugin = ctx.plugin(Plugin, { home, executablePath: executable })
      handles.push(plugin)
      await plugin.await()
      const skills = await ctx.get('skills').list()
      assert.equal(skills.length, 2)
      for (const skill of skills)
        assert.ok(
          (await ctx.get('skills').get(skill.name)).content.includes(
            'eu4_indexer_manage',
          ),
        )
      const forbidden = await rpc(
        'eu4-indexer/dispatch',
        { operation: 'state' },
        new AbortController().signal,
        { principal: { kind: 'shared' } },
      )
      assert.equal(forbidden.ok, false)
      const owner = async (request) => {
        const r = await rpc(
          'eu4-indexer/dispatch',
          request,
          new AbortController().signal,
          { principal: { kind: 'owner' } },
        )
        assert.equal(r.ok, true, JSON.stringify(r))
        return r.value
      }
      await owner({ operation: 'bind', sessionId: 'one', name: 'eu4' })
      await owner({ operation: 'bind', sessionId: 'two', name: 'hoi4' })
      const tool = (agent, name) =>
        ctx
          .get('tools')
          .definitions(agent)
          .find((d) => d.name === `mcp__eu4__${name}`)
      assert.ok(tool(agents.get('one'), 'read_query'))
      assert.ok(tool(agents.get('two'), 'read_query'))
      const run = (agent, name, args) =>
        tool(agent, name).execute(args, {
          agent,
          signal: new AbortController().signal,
        })
      const [a, b] = await Promise.all(
        [...agents.values()].map((agent) =>
          run(agent, 'read_query', {
            sql: "SELECT value FROM meta WHERE key='game_id'",
          }),
        ),
      )
      assert.match(texts(a), /eu4/)
      assert.match(texts(b), /hoi4/)
      await run(agents.get('one'), 'select_database', { name: 'hoi4' })
      assert.match(
        texts(
          await run(agents.get('two'), 'read_query', {
            sql: "SELECT value FROM meta WHERE key='game_id'",
          }),
        ),
        /hoi4/,
      )
      await owner({ operation: 'unbind', sessionId: 'one' })
      assert.equal(tool(agents.get('one'), 'read_query'), undefined)
      assert.ok(tool(agents.get('two'), 'read_query'))
      await plugin.dispose()
      handles.pop()
      assert.equal(tool(agents.get('two'), 'read_query'), undefined)
      assert.equal((await ctx.get('skills').list()).length, 0)
      disposeConnection()
      const headless = ctx.plugin(Plugin, { home, executablePath: executable })
      handles.push(headless)
      await headless.await()
      assert.ok(
        ctx
          .get('tools')
          .definitions()
          .some((tool) => tool.name === 'eu4_indexer_manage'),
      )
      assert.ok(tool(agents.get('two'), 'read_query'))
    } finally {
      for (const handle of handles.reverse()) await handle.dispose()
      for (const scope of scopes) await scope.dispose()
      await rm(home, { recursive: true, force: true })
    }
  },
)
