import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-connection'
import type {} from '@deepseek-ai/dsh-tools'
import type { ServiceOptions } from './service.js'
import os from 'node:os'
import path from 'node:path'
import z from '@deepseek-ai/schemastery'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import { IndexerService } from './service.js'
import { SessionConnections } from './integration/sessions.js'
import { registerSkills } from './integration/skills.js'
import { failure } from './util.js'
export type {
  Api,
  ManagementRequest,
  ManagementResponses,
  ServiceState,
  Task,
} from './contracts.js'

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
export type Config = Omit<ServiceOptions, 'engine'> & {
  language?: 'auto' | 'zh' | 'en'
}
export async function apply(ctx: Context, config: Config) {
  const service = new IndexerService({
    ...config,
    home: path.resolve(config.home),
  })
  await service.init()
  const sessions = new SessionConnections(ctx, service, McpClient)
  service.onEngineChanging = (signal) => sessions.suspend(signal)
  service.onEngineChanged = () => sessions.resume()
  service.onRegistered = (name) => sessions.refresh(name)
  service.tasks.onCompleted = (task) =>
    ['index', 'refresh'].includes(task.kind)
      ? sessions.refresh(task.input.name)
      : undefined
  ctx.effect(() => async () => {
    await Promise.all([service.stop(), sessions.stop()])
  })
  await registerSkills(ctx)
  ctx.inject(['connection'], (ctx) => {
    // /api's sole RPC interceptor belongs to DSH's Gateway. Exact Fetch
    // routes coexist with it and Connection admits only owner Peers here.
    ctx.connection.fetch.register({
      path: '/api/eu4-indexer/dispatch',
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request) {
        if (
          request.headers
            .get('content-type')
            ?.split(';', 1)[0]
            .trim()
            .toLowerCase() !== 'application/json'
        )
          return new Response('content type must be application/json', {
            status: 415,
          })
        let message
        try {
          message = await request.json()
        } catch {
          return new Response('body is not JSON', { status: 400 })
        }
        if (
          message?.type !== 'client-request' ||
          typeof message.rpcId !== 'string' ||
          message.method !== 'eu4-indexer/dispatch'
        )
          return new Response('invalid client-request envelope', {
            status: 400,
          })
        let result
        try {
          result = {
            ok: true,
            value: await service.dispatch(message.payload, {
              signal: request.signal,
            }),
          }
        } catch (error) {
          const detail = failure(error)
          result = {
            ok: false,
            error: {
              code: 'gateway/bad-request',
              message: detail.error,
              details: { code: detail.code },
            },
          }
        }
        return Response.json({
          type: 'server-response',
          rpcId: message.rpcId,
          result,
        })
      },
    })
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
  const connect = (agent: ReturnType<Context['agents']['list']>[number]) =>
    sessions
      .rebind(String(agent.id))
      .catch((error) =>
        ctx.logger.warn(
          'EU4 Indexer connection failed: %s',
          failure(error).error,
        ),
      )
  ctx.on('agent/created', async ({ agent }) => {
    await connect(agent)
    return undefined
  })
  ctx.on('agent/disposed', ({ agent }) => sessions.disposeAgent(agent))
  for (const agent of ctx.agents.list()) await connect(agent)
}
