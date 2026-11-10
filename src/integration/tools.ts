import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import type { IndexerService } from '../service.js'
import type { ManagementRequest } from '../contracts.js'
import type { SessionConnections } from './sessions.js'
import { UserError } from '../util.js'

type Field = {
  type: string
  enum?: string[]
  items?: { type: string }
  minimum?: number
  maximum?: number
}
const fields: Record<string, Field> = {
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
}
const discovery = [
  'game',
  'gameDir',
  'mods',
  'workshopIds',
  'playset',
  'autoMods',
]
export const managementTools = [
  {
    operation: 'state',
    description:
      'Read engine readiness, bundled game rules, indexes, tasks and chat bindings. The engine and rules are installed and updated with the plugin. Missing or damaged platform packages require reinstalling the plugin with optional dependencies enabled.',
  },
  {
    operation: 'capabilities',
    description:
      'Read engine version, supported games, management API and supported operations.',
  },
  {
    operation: 'status',
    description:
      'Read detected game environments and bundled or overridden game-rule paths.',
  },
  {
    operation: 'list',
    description:
      'List registered EU4/HOI4 indexes and the registry default. This does not change any session selection.',
  },
  {
    operation: 'detect',
    description:
      'Preview a game and its selected mods in load order before indexing. game defaults to eu4.',
    fields: discovery,
  },
  {
    operation: 'workshop',
    description:
      'Discover installed Steam Workshop mods for the selected game (default eu4).',
    fields: ['game'],
  },
  {
    operation: 'playsets',
    description:
      'List launcher playsets and their ordered mods for the selected game (default eu4).',
    fields: ['game'],
  },
  {
    operation: 'inspect',
    description:
      'Inspect an index by name or path, including paginated parse errors. Supply name or path.',
    fields: ['name', 'path', 'errorOffset', 'errorLimit'],
  },
  {
    operation: 'index',
    description:
      'Build an immutable EU4/HOI4 index using bundled rules unless configDir overrides them. Returns a task; poll eu4_indexer_tasks until terminal. Failed builds preserve existing indexes.',
    fields: [
      ...discovery,
      'name',
      'configDir',
      'languages',
      'skipGeneric',
      'noFts',
      'setActive',
    ],
    required: ['name'],
  },
  {
    operation: 'refresh',
    description:
      'Rebuild an index from saved source selection. Default rules follow the installed engine version; explicit rule directories remain selected. Returns a task; poll eu4_indexer_tasks until terminal.',
    fields: ['name', 'game'],
    required: ['name'],
  },
  {
    operation: 'register',
    description:
      'Import an existing compatible database by name and path. A replacement reconnects affected query sessions.',
    fields: ['name', 'path', 'setActive'],
    required: ['name', 'path'],
  },
  {
    operation: 'remove',
    description:
      'Unregister an unused index. Optional deleteFile only deletes files inside the managed database directory. Bound or currently queried indexes are protected.',
    fields: ['name', 'deleteFile'],
    required: ['name'],
  },
  {
    operation: 'bind',
    description:
      'Set the current chat default index and connect its isolated MCP query tools. Does not change other chats.',
    fields: ['name'],
    required: ['name'],
  },
  {
    operation: 'unbind',
    description:
      'Clear the current chat default and close its MCP query connection. Does not change other chats.',
  },
  {
    operation: 'tasks',
    description:
      'List background tasks, progress, terminal results and errors. Keep polling builds or cancellations until terminal.',
  },
  {
    operation: 'cancel_task',
    description:
      'Request cancellation of a task by id. Keep polling eu4_indexer_tasks until it reaches a terminal state.',
    fields: ['taskId'],
    required: ['taskId'],
  },
] as const

export function registerManagementTools(
  ctx: Context,
  service: IndexerService,
  sessions: SessionConnections,
) {
  ctx.tools.register({
    name: 'eu4_indexer_tools',
    description:
      'Load or unload EU4/HOI4 management and query tools for this chat. Load the matching game skill, then call with enabled=true before using game tools; enabled=false removes them from future requests. Other chats are unaffected.',
    parameters: {
      type: 'object',
      properties: { enabled: { type: 'boolean' } },
      required: ['enabled'],
      additionalProperties: false,
    },
    output: {
      schema: {},
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: async (args, execution) => {
      if (!execution.agent) throw new UserError('A current chat is required')
      const enabled = (args as { enabled: boolean }).enabled
      if (typeof enabled !== 'boolean')
        throw new UserError('enabled must be a boolean')
      return sessions.setToolsEnabled(
        execution.agent,
        enabled,
        execution.signal,
      )
    },
  })
  for (const tool of managementTools) {
    const names = 'fields' in tool ? tool.fields : []
    ctx.tools.register(
      {
        name: `eu4_indexer_${tool.operation}`,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            names.map((name) => [name, fields[name]]),
          ),
          required: 'required' in tool ? [...tool.required] : [],
          additionalProperties: false,
        },
        output: {
          schema: {},
          render: (_args, value) => [
            { type: 'text', text: JSON.stringify(value) },
          ],
        },
        execute: async (args, execution) =>
          service.dispatch(
            {
              ...Object.fromEntries(
                names
                  .filter((name) => Object.hasOwn(args as object, name))
                  .map((name) => [
                    name,
                    (args as Record<string, unknown>)[name],
                  ]),
              ),
              operation: tool.operation,
            } as ManagementRequest,
            {
              signal: execution.signal,
              currentSession: execution.agent?.id,
            },
          ),
      },
      { when: ({ agent }) => sessions.toolsEnabled(agent) },
    )
  }
}
