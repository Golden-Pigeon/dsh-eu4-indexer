import test from 'node:test'
import assert from 'node:assert/strict'
import { registerManagementTools } from '../dist/integration/tools.js'

test('independent tools forward only their fields and current agent identity', async () => {
  const tools = []
  const registrations = []
  const calls = []
  const sessions = {
    toolsEnabled: (agent) => agent?.enabled === true,
    setToolsEnabled: async (...args) => {
      calls.push(args)
      return { enabled: true }
    },
  }
  registerManagementTools(
    {
      tools: {
        register: (tool, options) => {
          tools.push(tool)
          registrations.push(options)
        },
      },
    },
    {
      dispatch: async (...args) => {
        calls.push(args)
        return { ok: true }
      },
    },
    sessions,
  )
  assert.equal(tools.length, 17)
  const loader = tools.shift()
  assert.equal(loader.name, 'eu4_indexer_tools')
  assert.equal(new Set(tools.map((tool) => tool.name)).size, 16)
  const signal = new AbortController().signal
  const agent = { id: 'current-chat', enabled: true }
  assert.equal(registrations[0], undefined)
  for (const options of registrations.slice(1)) {
    assert.equal(options.when({ agent }), true)
    assert.equal(options.when({ agent: { id: 'other-chat' } }), false)
  }
  assert.deepEqual(
    await loader.execute(
      { enabled: true, sessionId: 'other-chat' },
      { agent, signal },
    ),
    { enabled: true },
  )
  assert.deepEqual(calls.at(-1), [agent, true, signal])
  await assert.rejects(
    loader.execute({ enabled: 'true' }, { agent, signal }),
    /must be a boolean/,
  )
  await assert.rejects(
    loader.execute({ enabled: true }, { signal }),
    /current chat is required/,
  )
  for (const tool of tools) {
    assert.equal(tool.parameters.additionalProperties, false)
    assert.ok(!Object.hasOwn(tool.parameters.properties, 'operation'))
    assert.ok(!Object.hasOwn(tool.parameters.properties, 'sessionId'))
    const args = Object.fromEntries(
      Object.keys(tool.parameters.properties).map((key) => [key, key]),
    )
    const result = await tool.execute(
      {
        ...args,
        operation: 'setup',
        sessionId: 'another-chat',
        executablePath: '/untrusted',
      },
      { signal, agent: { id: 'current-chat' } },
    )
    assert.deepEqual(calls.at(-1), [
      { ...args, operation: tool.name.slice('eu4_indexer_'.length) },
      { signal, currentSession: 'current-chat' },
    ])
    assert.deepEqual(JSON.parse(tool.output.render({}, result)[0].text), result)
  }
  const bind = tools.find((tool) => tool.name === 'eu4_indexer_bind')
  await bind.execute({ name: 'vanilla', sessionId: 'another-chat' }, { signal })
  assert.equal(calls.at(-1)[0].sessionId, undefined)
  assert.equal(calls.at(-1)[1].currentSession, undefined)
})
