import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline'
import Skills from '@deepseek-ai/dsh-skill'
import { createScope } from '@deepseek-ai/dsh-scope'
import * as Plugin from '../../dist/index.js'

for (const managed of [false, true])
  test(
    managed
      ? 'packed independent management tools use bundled engine and rules immediately'
      : 'management pipeline reports an unavailable engine and failed background tasks as JSON',
    { skip: managed && !process.env.DSH_TEST_PLUGIN_ROOT, timeout: 60000 },
    async () => {
      const home = await mkdtemp(path.join(os.tmpdir(), 'dsh-management-'))
      const ctx = new Context()
      const handles = []
      const agent = { id: 'first-use' }
      let scope
      try {
        ctx.provide('agents', {
          list: () => [agent],
          get: (id) => (id === agent.id ? agent : undefined),
        })
        for (const dependency of [SystemPrompt, Tools, Skills]) {
          const handle = ctx.plugin(dependency)
          handles.push(handle)
          await handle.await()
        }
        scope = createScope(ctx, agent)
        agent.ctx = scope.ctx
        const handle = ctx.plugin(Plugin, {
          home,
          // Force the unavailable-engine path even in source checkouts with built engines.
          executablePath: managed
            ? ''
            : path.join(home, 'missing', 'eu4indexer'),
        })
        handles.push(handle)
        await handle.await()
        const pipeline = new ToolExecutionPipeline(ctx)
        let callId = 0
        const run = async (args, expectError = false) => {
          const toolSet = await ctx.tools.resolve({
            agent,
            modelSelection: { provider: 'fixture', model: 'fixture' },
            signal: new AbortController().signal,
          })
          try {
            const prepared = await pipeline.prepare({
              callId: `management-${++callId}`,
              name: `eu4_indexer_${args.operation}`,
              arguments: Object.fromEntries(
                Object.entries(args).filter(([key]) => key !== 'operation'),
              ),
              agent,
              toolSet,
              signal: new AbortController().signal,
            })
            const outcome =
              prepared.kind === 'dispatch'
                ? await pipeline.dispatch(prepared.exec)
                : prepared
            const result = await pipeline.complete(prepared.exec, outcome)
            const text = result.content
              .filter((block) => block.type === 'text')
              .map((block) => block.text)
              .join('')
            if (expectError) {
              assert.equal(result.isError, true, text)
              return text
            }
            assert.notEqual(result.isError, true, text)
            return JSON.parse(text)
          } finally {
            toolSet.dispose()
          }
        }
        const definitions = ctx.get('tools').definitions()
        const management = definitions.filter((tool) =>
          tool.name.startsWith('eu4_indexer_'),
        )
        assert.equal(management.length, 17)
        for (const name of [
          'eu4_indexer_manage',
          'eu4_indexer_setup',
          'eu4_indexer_install_engine',
        ])
          assert.ok(!definitions.some((tool) => tool.name === name))
        const initialTools = await ctx.tools.resolve({
          agent,
          modelSelection: { provider: 'fixture', model: 'fixture' },
          signal: new AbortController().signal,
        })
        assert.deepEqual(
          [...initialTools.view(agent).keys()].filter((name) =>
            name.startsWith('eu4_indexer_'),
          ),
          ['eu4_indexer_tools'],
        )
        initialTools.dispose()
        await run({ operation: 'state' }, true)
        const loaded = await run({ operation: 'tools', enabled: true })
        assert.equal(loaded.enabled, true)
        const admittedNames = async () => {
          const toolSet = await ctx.tools.resolve({
            agent,
            modelSelection: { provider: 'fixture', model: 'fixture' },
            signal: new AbortController().signal,
          })
          try {
            return [...toolSet.view(agent).keys()]
              .filter((name) => name.startsWith('eu4_indexer_'))
              .sort()
          } finally {
            toolSet.dispose()
          }
        }
        assert.equal((await admittedNames()).length, 17)
        assert.deepEqual(await run({ operation: 'tools', enabled: false }), {
          enabled: false,
          queryConnected: false,
        })
        assert.deepEqual(await admittedNames(), ['eu4_indexer_tools'])
        await run({ operation: 'state' }, true)
        await run({ operation: 'tools', enabled: true })
        const state = await run({ operation: 'state' })
        assert.equal(state.engine.ready, managed)
        if (!managed) assert.equal(state.engine.code, 'engine_missing')
        assert.equal(Object.hasOwn(state, 'environment'), managed)
        assert.deepEqual(state.registry.databases, [])
        assert.deepEqual(state.tasks, [])
        assert.equal(state.sessions[0].id, agent.id)
        assert.equal(state.sessions[0].index, '')

        const waitForTask = async (id) => {
          const deadline = Date.now() + 30000
          while (Date.now() < deadline) {
            const task = (await run({ operation: 'tasks' })).find(
              (row) => row.id === id,
            )
            if (
              ['succeeded', 'failed', 'cancelled', 'interrupted'].includes(
                task.state,
              )
            )
              return task
            await new Promise((resolve) => setTimeout(resolve, 50))
          }
          throw new Error('Management task did not finish within 30 seconds')
        }
        if (managed) {
          assert.deepEqual((await run({ operation: 'list' })).databases, [])
          await assert.rejects(access(path.join(home, 'engine/current')), {
            code: 'ENOENT',
          })
          const ready = await run({ operation: 'state' })
          assert.equal(ready.engine.ready, true)
          assert.deepEqual(
            ready.environment.games.map((game) => game.game).sort(),
            ['eu4', 'hoi4'],
          )
          assert.ok(ready.environment.games.every((game) => game.configReady))
          assert.ok(
            !(await run({ operation: 'capabilities' })).operations.includes(
              'setup',
            ),
          )
          for (const game of ['eu4', 'hoi4']) {
            const job = await run({
              operation: 'index',
              name: game,
              game,
              gameDir: path.resolve(
                import.meta.dirname,
                '../../external/eu4-indexer/Eu4Indexer.Tests/fixtures',
                game,
                'example-game',
              ),
            })
            const built = await waitForTask(job.id)
            assert.equal(built.state, 'succeeded', JSON.stringify(built))
            assert.ok(built.result.report.entityCount > 0)
            const info = await run({ operation: 'inspect', name: game })
            assert.equal(info.meta.config_source, 'bundled')
            assert.equal(info.meta.game_id, game)
            const refreshing = await run({ operation: 'refresh', name: game })
            const refreshed = await waitForTask(refreshing.id)
            assert.equal(
              refreshed.state,
              'succeeded',
              JSON.stringify(refreshed),
            )
            assert.notEqual(
              refreshed.result.index.path,
              built.result.index.path,
            )
          }
          assert.equal((await run({ operation: 'list' })).databases.length, 2)
          return
        }

        // An engine-dependent job fails normally; polling must still work afterwards.
        const task = await run({
          operation: 'index',
          game: 'eu4',
          name: 'unavailable',
        })
        assert.equal(task.kind, 'index')
        const terminal = await waitForTask(task.id)
        assert.equal(terminal.state, 'failed')
        assert.equal(terminal.code, 'engine_missing')
        const after = await run({ operation: 'state' })
        assert.equal(after.engine.ready, false)
        assert.equal(after.tasks[0].id, task.id)
        assert.equal(after.tasks[0].state, 'failed')
      } finally {
        for (const handle of handles.reverse()) await handle.dispose()
        if (scope) await scope.dispose()
        await rm(home, { recursive: true, force: true })
      }
    },
  )
