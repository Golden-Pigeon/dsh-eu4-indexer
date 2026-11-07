import os from 'node:os'
import path from 'node:path'
import z from '@deepseek-ai/schemastery'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import { IndexerService } from './service.js'
import { SessionConnections } from './integration/sessions.js'
import { registerSkills } from './integration/skills.js'
import { failure } from './util.js'

export const name = 'dsh-eu4-indexer'
export const inject = ['agents', 'tools', 'skills']
export const Config = z.object({
  home: z
    .string()
    .default(path.join(os.homedir(), '.dsh', 'data', 'eu4-indexer'))
    .description(
      'Directory for managed engines, rules, indexes, tasks and session defaults.',
    ),
  executablePath: z
    .string()
    .default('')
    .description(
      'Optional external eu4indexer executable supporting management API 1.',
    ),
  language: z
    .union(['auto', 'zh', 'en'])
    .default('auto')
    .description(
      'Deprecated compatibility field; the model selects the skill translation from the conversation, regardless of this value.',
    ),
  concurrency: z.number().min(1).max(8).default(2),
  timeoutMs: z.number().min(1000).max(300000).default(30000),
  toolCallTimeoutMs: z.number().min(1000).max(600000).default(60000),
})
export async function apply(ctx, config) {
  const service = new IndexerService({
    ...config,
    home: path.resolve(config.home),
  })
  await service.init()
  const sessions = new SessionConnections(ctx, service, McpClient)
  service.onEngineChanging = () => sessions.suspend()
  service.onEngineChanged = () => sessions.resume()
  service.tasks.onCompleted = (task) =>
    ['index', 'refresh'].includes(task.kind)
      ? sessions.refresh(task.input.name)
      : undefined
  ctx.effect(() => async () => {
    await service.stop()
    await sessions.stop()
  })
  await registerSkills(ctx)
  ctx.inject(['connection'], (ctx) => {
    ctx.connection.rpc.intercept(
      '/api',
      (endpoint) => endpoint === 'eu4-indexer/dispatch',
      async (_endpoint, request, signal, peer) => {
        if (peer.principal.kind !== 'owner')
          return {
            ok: false,
            error: {
              code: 'gateway/forbidden',
              message: 'Owner access required',
              details: {},
            },
          }
        try {
          return {
            ok: true,
            value: await service.dispatch(request, { signal }),
          }
        } catch (error) {
          const detail = failure(error)
          return {
            ok: false,
            error: {
              code: 'gateway/bad-request',
              message: detail.error,
              details: { code: detail.code },
            },
          }
        }
      },
    )
  })
  ctx.tools.register({
    name: 'eu4_indexer_manage',
    description:
      'Manage EU4/HOI4 engine, rules, indexes and background tasks. Use state/list before querying; bind sets the current session default. index/refresh/setup/install_engine return a task id; inspect tasks until terminal. Existing game queries use mcp__eu4__ tools.',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: [
            'state',
            'capabilities',
            'status',
            'detect',
            'workshop',
            'playsets',
            'list',
            'inspect',
            'setup',
            'index',
            'refresh',
            'register',
            'remove',
            'bind',
            'unbind',
            'tasks',
            'cancel_task',
            'install_engine',
          ],
        },
        game: { type: 'string', enum: ['eu4', 'hoi4'] },
        name: { type: 'string' },
        gameDir: { type: 'string' },
        configDir: { type: 'string' },
        mods: { type: 'array', items: { type: 'string' } },
        workshopIds: { type: 'array', items: { type: 'string' } },
        playset: { type: 'string' },
        autoMods: { type: 'boolean' },
        languages: { type: 'array', items: { type: 'string' } },
        skipGeneric: { type: 'boolean' },
        noFts: { type: 'boolean' },
        path: { type: 'string' },
        taskId: { type: 'string' },
        deleteFile: { type: 'boolean' },
        setActive: { type: 'boolean' },
        errorOffset: { type: 'integer', minimum: 0 },
        errorLimit: { type: 'integer', minimum: 1, maximum: 1000 },
      },
      required: ['operation'],
      additionalProperties: false,
    },
    output: {
      schema: {},
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: async (request, execution) => {
      const result = await service.dispatch(request, {
        signal: execution.signal,
        currentSession: execution.agent?.id,
      })
      return result
    },
  })
  const connect = (agent) =>
    sessions
      .rebind(String(agent.id))
      .catch((error) =>
        ctx.logger.warn('EU4 Indexer connection failed: %s', error.message),
      )
  ctx.on('agent/created', async ({ agent }) => {
    await connect(agent)
    return undefined
  })
  ctx.on('agent/disposed', ({ agent }) =>
    sessions.disposeAgent(String(agent.id)),
  )
  for (const agent of ctx.agents.list()) await connect(agent)
}
