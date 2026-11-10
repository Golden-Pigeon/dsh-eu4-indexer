import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline'
import Skills, { isModelInvocable } from '@deepseek-ai/dsh-skill'
import * as ToolSkill from '@deepseek-ai/dsh-tool-skill'
import { createScope } from '@deepseek-ai/dsh-scope'
import * as Connection from '@deepseek-ai/dsh-client-connection'
import * as Plugin from '../../dist/index.js'
import { Engine } from '../../dist/engine/runtime.js'
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
  // Includes several real index builds and MCP reconnects on slower CI runners.
  { timeout: 180000 },
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
      ctx.provide('workingDirectory', { ensure: async () => home })
      handles.push(ctx.plugin(ToolSkill))
      await handles.at(-1).await()
      let credentialRecord
      ctx.provide('credentials', {
        async modifyRecord(_key, mutate) {
          credentialRecord = await mutate(credentialRecord)
          return credentialRecord
        },
      })
      const connectionPlugin = ctx.plugin(Connection)
      handles.push(connectionPlugin)
      await connectionPlugin.await()
      const connection = ctx.get('connection')
      // A real DSH host has already assigned /api's single interceptor to Gateway.
      connection.rpc.intercept(
        '/api',
        (endpoint) => endpoint === 'fixture/gateway',
        async () => ({ ok: true, value: 'gateway still works' }),
      )
      const shared = connection.createSharedFetchHandler('/api')
      rpc = async (method, payload, signal, peer = connection.browserPeer) =>
        shared.fetch(
          new Request(`http://localhost/api/${method}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            signal,
            body: JSON.stringify({
              type: 'client-request',
              rpcId: 'integration',
              method,
              payload,
            }),
          }),
          peer,
        )
      for (const id of ['one', 'two']) {
        const agent = { id }
        const scope = createScope(ctx, agent)
        scopes.push(scope)
        agent.ctx = scope.ctx
        agents.set(id, agent)
      }
      const plugin = ctx.plugin(Plugin, {
        home,
        executablePath: executable,
        language: 'en',
      })
      handles.push(plugin)
      await plugin.await()
      assert.equal(
        (
          await shared.fetch(
            new Request('http://localhost/api/eu4-indexer/dispatch', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: '{',
            }),
            connection.browserPeer,
          )
        ).status,
        400,
      )
      assert.equal(
        (
          await shared.fetch(
            new Request('http://localhost/api/eu4-indexer/dispatch', {
              method: 'POST',
              body: 'not JSON',
            }),
            connection.browserPeer,
          )
        ).status,
        415,
      )
      assert.equal(
        (await rpc('eu4-indexer/dispatch', { operation: 'unknown' })).status,
        200,
      )
      const skills = await ctx.get('skills').list()
      assert.equal(skills.length, 6)
      assert.deepEqual(
        skills.filter(isModelInvocable).map((s) => s.name),
        ['eu4-en', 'eu4-zh', 'hoi4-en', 'hoi4-zh'],
      )
      for (const skill of skills)
        assert.ok(
          (await ctx.get('skills').get(skill.name)).content.includes(
            'eu4_indexer_state',
          ),
        )
      const loadSkill = (id, name) =>
        ctx
          .get('tools')
          .get('skill', agents.get(id))
          .execute(
            { name },
            { agent: agents.get(id), signal: new AbortController().signal },
          )
      const [chinese, english] = await Promise.all([
        loadSkill('one', 'eu4-zh'),
        loadSkill('two', 'eu4-en'),
      ])
      assert.match(chinese.content, /## 游戏简介/)
      assert.match(english.content, /## About Europa/)
      assert.match(
        (await loadSkill('one', 'eu4-en')).content,
        /## About Europa/,
      )
      assert.match((await loadSkill('two', 'eu4-zh')).content, /## 游戏简介/)
      await assert.rejects(
        loadSkill('one', 'eu4'),
        /not available for model invocation/,
      )
      const forbidden = await rpc(
        'eu4-indexer/dispatch',
        { operation: 'state' },
        new AbortController().signal,
        connection.createPeer({ principal: { kind: 'shared' } }),
      )
      assert.equal(forbidden.status, 403)
      assert.equal(
        (await (await rpc('fixture/gateway', {})).json()).result.value,
        'gateway still works',
      )
      const owner = async (request) => {
        const response = await rpc(
          'eu4-indexer/dispatch',
          request,
          new AbortController().signal,
        )
        assert.equal(response.status, 200)
        const envelope = await response.json()
        assert.equal(envelope.type, 'server-response')
        assert.equal(envelope.rpcId, 'integration')
        const r = envelope.result
        assert.equal(r.ok, true, JSON.stringify(r))
        return r.value
      }
      let activationId = 0
      const admitted = async (agent) => {
        const toolSet = await ctx.tools.resolve({
          agent,
          modelSelection: { provider: 'fixture', model: 'fixture' },
          signal: new AbortController().signal,
        })
        try {
          return [...toolSet.view(agent).keys()]
            .filter((name) => /^(eu4_indexer_|mcp__eu4__)/.test(name))
            .sort()
        } finally {
          toolSet.dispose()
        }
      }
      const setTools = async (agent, enabled = true) => {
        const loader = new ToolExecutionPipeline(ctx)
        const signal = new AbortController().signal
        const toolSet = await ctx.tools.resolve({
          agent,
          modelSelection: { provider: 'fixture', model: 'fixture' },
          signal,
        })
        try {
          const prepared = await loader.prepare({
            callId: `activate-${++activationId}`,
            name: 'eu4_indexer_tools',
            arguments: { enabled },
            agent,
            signal,
            toolSet,
          })
          const outcome =
            prepared.kind === 'dispatch'
              ? await loader.dispatch(prepared.exec)
              : prepared
          const result = await loader.complete(prepared.exec, outcome)
          assert.notEqual(result.isError, true, texts(result))
        } finally {
          toolSet.dispose()
        }
      }
      // Owner UI bindings persist without eagerly connecting either chat.
      await owner({ operation: 'bind', sessionId: 'one', name: 'eu4' })
      await owner({ operation: 'bind', sessionId: 'two', name: 'hoi4' })
      for (const agent of agents.values()) {
        assert.deepEqual(await admitted(agent), ['eu4_indexer_tools'])
        assert.ok(!ctx.tools.get('mcp__eu4__read_query', agent))
      }
      await setTools(agents.get('one'))
      assert.equal((await admitted(agents.get('one'))).length, 34)
      assert.deepEqual(await admitted(agents.get('two')), ['eu4_indexer_tools'])
      await setTools(agents.get('two'))
      await setTools(agents.get('one'), false)
      assert.deepEqual(await admitted(agents.get('one')), ['eu4_indexer_tools'])
      assert.equal((await admitted(agents.get('two'))).length, 34)
      assert.equal((await owner({ operation: 'state' })).bindings.one, 'eu4')
      await setTools(agents.get('one'))
      // rc.1 clear/resume replaces the Agent but preserves its session id.
      const oldAgent = agents.get('one')
      await ctx.parallel('agent/disposed', { agent: oldAgent })
      const resumedAgent = { id: 'one' }
      const resumedScope = createScope(ctx, resumedAgent)
      scopes.push(resumedScope)
      resumedAgent.ctx = resumedScope.ctx
      agents.set('one', resumedAgent)
      await ctx.serial('agent/created', { agent: resumedAgent })
      assert.ok(!ctx.tools.get('mcp__eu4__read_query', resumedAgent))
      await setTools(resumedAgent)
      await ctx.parallel('agent/disposed', { agent: oldAgent })
      const tool = (agent, name) =>
        ctx
          .get('tools')
          .definitions(agent)
          .find((d) => d.name === `mcp__eu4__${name}`)
      assert.ok(tool(agents.get('one'), 'read_query'))
      assert.ok(tool(agents.get('two'), 'read_query'))
      const pipeline = new ToolExecutionPipeline(ctx)
      let callId = 0
      const run = async (agent, name, args) => {
        const prepared = await pipeline.prepare({
          callId: `integration-${++callId}`,
          name: `mcp__eu4__${name}`,
          arguments: args,
          agent,
          signal: new AbortController().signal,
        })
        const outcome =
          prepared.kind === 'dispatch'
            ? await pipeline.dispatch(prepared.exec)
            : prepared
        const result = await pipeline.complete(prepared.exec, outcome)
        assert.notEqual(result.isError, true, texts(result))
        return result
      }
      const [a, b] = await Promise.all(
        [...agents.values()].map((agent) =>
          run(agent, 'read_query', {
            sql: "SELECT value FROM meta WHERE key='game_id'",
          }),
        ),
      )
      assert.match(texts(a), /eu4/)
      assert.match(texts(b), /hoi4/)
      const registry = await engine.call({ operation: 'list' })
      const database = (name) =>
        registry.databases.find((db) => db.name === name).path
      // Replacing a registration must replace affected live MCP clients too.
      await owner({
        operation: 'register',
        name: 'eu4',
        path: database('hoi4'),
      })
      assert.match(
        texts(
          await run(agents.get('one'), 'read_query', {
            sql: "SELECT value FROM meta WHERE key='game_id'",
          }),
        ),
        /hoi4/,
      )
      await owner({ operation: 'register', name: 'eu4', path: database('eu4') })
      assert.match(
        texts(
          await run(agents.get('one'), 'read_query', {
            sql: "SELECT value FROM meta WHERE key='game_id'",
          }),
        ),
        /eu4/,
      )
      assert.match(
        texts(
          await run(agents.get('two'), 'read_query', {
            sql: "SELECT value FROM meta WHERE key='game_id'",
          }),
        ),
        /hoi4/,
      )
      assert.equal(
        (await owner({ operation: 'configure', executablePath: executable }))
          .ready,
        true,
      )
      for (const [id, game] of [
        ['one', 'eu4'],
        ['two', 'hoi4'],
      ])
        assert.match(
          texts(
            await run(agents.get(id), 'read_query', {
              sql: "SELECT value FROM meta WHERE key='game_id'",
            }),
          ),
          new RegExp(game),
        )
      const nativeVersion = texts(
        await run(agents.get('one'), 'read_query', {
          sql: 'SELECT sqlite_version() AS native_version',
        }),
      ).match(/\b(\d+)\.(\d+)\.(\d+)\b/)
      assert.ok(
        nativeVersion,
        'The running engine must report its native SQLite version',
      )
      const [major, minor, patch] = nativeVersion.slice(1).map(Number)
      assert.ok(
        major > 3 ||
          (major === 3 && (minor > 50 || (minor === 50 && patch >= 2))),
        `Vulnerable native SQLite: ${nativeVersion[0]}`,
      )
      assert.match(
        texts(
          await run(agents.get('two'), 'what_does_it_do', {
            entityKey: 'fixture_multi_track_doctrine',
            entityType: 'subdoctrine',
          }),
        ),
        /doctrine_excludes/,
      )
      await run(agents.get('one'), 'select_database', { name: 'hoi4' })
      const refresh = await owner({
        operation: 'refresh',
        name: 'hoi4',
        game: 'hoi4',
      })
      let rebuilt
      for (let i = 0; i < 200; i++) {
        rebuilt = (await owner({ operation: 'tasks' })).find(
          (task) => task.id === refresh.id,
        )
        if (!['queued', 'running', 'cancelling'].includes(rebuilt.state)) break
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      assert.equal(rebuilt.state, 'succeeded', JSON.stringify(rebuilt))
      assert.equal(rebuilt.warnings, undefined)
      const afterRefresh = await owner({ operation: 'state' })
      assert.equal(
        afterRefresh.sessions.find((s) => s.id === 'one').index,
        'eu4',
      )
      assert.equal(
        afterRefresh.sessions.find((s) => s.id === 'two').index,
        'hoi4',
      )
      assert.match(
        texts(
          await run(agents.get('one'), 'read_query', {
            sql: "SELECT value FROM meta WHERE key='game_id'",
          }),
        ),
        /eu4/,
      )
      await run(agents.get('one'), 'select_database', { name: 'hoi4' })
      await owner({ operation: 'unbind', sessionId: 'two' })
      const selectedState = await owner({ operation: 'state' })
      assert.equal(
        selectedState.sessions.find((s) => s.id === 'one').index,
        'hoi4',
      )
      assert.equal(selectedState.bindings.one, 'eu4')
      const blockedResponse = await rpc(
        'eu4-indexer/dispatch',
        { operation: 'remove', name: 'hoi4', deleteFile: true },
        new AbortController().signal,
      )
      const blocked = (await blockedResponse.json()).result
      assert.equal(blocked.ok, false)
      assert.equal(blocked.error.details.code, 'index_in_use')
      await owner({ operation: 'bind', sessionId: 'two', name: 'hoi4' })
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
      assert.equal(
        (await rpc('eu4-indexer/dispatch', { operation: 'state' })).status,
        404,
      )
      assert.equal((await rpc('fixture/gateway', {})).status, 200)
      await connectionPlugin.dispose()
      handles.pop()
      const headless = ctx.plugin(Plugin, {
        home,
        executablePath: executable,
        language: 'zh',
      })
      handles.push(headless)
      await headless.await()
      assert.match(
        (await ctx.get('skills').get('eu4-en')).content,
        /## About Europa/,
      )
      assert.ok(
        ctx
          .get('tools')
          .definitions()
          .some((tool) => tool.name === 'eu4_indexer_state'),
      )
      assert.deepEqual(await admitted(agents.get('two')), ['eu4_indexer_tools'])
      await setTools(agents.get('two'))
      assert.ok(tool(agents.get('two'), 'read_query'))
    } finally {
      for (const handle of handles.reverse()) await handle.dispose()
      for (const scope of scopes) await scope.dispose()
      await rm(home, { recursive: true, force: true })
    }
  },
)
