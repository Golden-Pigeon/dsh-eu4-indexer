import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import { createScope } from '@deepseek-ai/dsh-scope'
import { SessionConnections } from '../../dist/integration/sessions.js'

// An owned child which accepts stdin but deliberately never completes MCP initialize.
const server = `
import { writeFileSync } from 'node:fs'
import path from 'node:path'
const home = process.argv[1]
writeFileSync(path.join(home, 'pid'), String(process.pid))
process.stdin.on('data', () => writeFileSync(path.join(home, 'started'), 'yes'))
process.stdin.on('end', () => process.exit(0))
process.stdin.resume()
`

for (const shutdown of [false, true])
  test(
    `${shutdown ? 'plugin shutdown' : 'caller cancellation'} closes an official rc.1 MCP client still initializing`,
    { timeout: 30000 },
    async () => {
      const home = await mkdtemp(path.join(os.tmpdir(), 'dsh-activation-'))
      const ctx = new Context()
      const prompt = ctx.plugin(SystemPrompt)
      await prompt.await()
      const handle = ctx.plugin(Tools)
      await handle.await()
      const agent = { id: 'starting-chat' }
      const scope = createScope(ctx, agent)
      agent.ctx = scope.ctx
      ctx.provide('agents', {
        get: (id) => (id === agent.id ? agent : undefined),
        list: () => [agent],
      })
      const service = {
        home,
        config: {},
        bindings: {},
        engine: {
          call: async () => ({
            activeDb: 'fixture',
            databases: [{ name: 'fixture', path: '/unused' }],
          }),
          querySession: async () => ({
            command: process.execPath,
            args: ['--input-type=module', '-e', server, home],
            env: { ELECTRON_RUN_AS_NODE: '1' },
            cwd: home,
          }),
        },
      }
      const sessions = new SessionConnections(ctx, service, McpClient)
      const controller = new AbortController()
      let loading, stopping, pid
      try {
        loading = sessions.setToolsEnabled(agent, true, controller.signal)
        loading.catch(() => {})
        const deadline = Date.now() + 10000
        while (true) {
          try {
            await readFile(path.join(home, 'started'))
            pid = Number(await readFile(path.join(home, 'pid'), 'utf8'))
            break
          } catch (error) {
            if (error.code !== 'ENOENT' || Date.now() >= deadline) throw error
            await new Promise((resolve) => setTimeout(resolve, 20))
          }
        }
        if (shutdown) stopping = sessions.stop()
        else controller.abort()
        await assert.rejects(loading, { name: 'AbortError' })
        await stopping
        assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
        assert.equal(sessions.toolsEnabled(agent), false)
        assert.equal(sessions.bindings.size, 0)
        assert.equal(ctx.tools.get('mcp__eu4__read_query', agent), undefined)
        await sessions.gate.run(false, () => {})
      } finally {
        controller.abort()
        await sessions.stop()
        await Promise.allSettled([loading, stopping])
        await scope.dispose()
        await handle.dispose()
        await prompt.dispose()
        await rm(home, { recursive: true, force: true })
      }
    },
  )
