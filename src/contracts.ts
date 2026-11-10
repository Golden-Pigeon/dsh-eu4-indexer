/** Shared management protocol and view models; no runtime imports. */
export type Game = 'eu4' | 'hoi4'
export interface ManagementRequest {
  operation: string
  name?: string
  game?: string
  sessionId?: string
  executablePath?: string
  taskId?: string
  path?: string
  gameDir?: string
  configDir?: string
  mods?: string[]
  workshopIds?: string[]
  playset?: string
  autoMods?: boolean
  languages?: string[]
  skipGeneric?: boolean
  noFts?: boolean
  setActive?: boolean
  deleteFile?: boolean
  errorOffset?: number
  errorLimit?: number
}
export interface Failure {
  error: string
  code: string
}
export interface Capabilities {
  apiVersion: number
  engineVersion: string
  operations?: string[]
}
export interface IndexEntry {
  name: string
  path: string
  game: string
  sources: number
  indexedAt: string
}
export interface Registry {
  activeDb: string
  databases: IndexEntry[]
}
export interface Environment {
  games: { game: Game; configReady: boolean }[]
}
export interface WorkshopMod {
  workshopId: string
  name: string
}
export interface Playset {
  id: string
  name: string
}
export interface Inspection {
  path: string
  parseErrorCount: number
  parseErrors: unknown[]
  errorOffset: number
  errorLimit: number
  hasMoreErrors: boolean
}
export interface EngineResponses {
  capabilities: Capabilities
  list: Registry
  status: Environment
  workshop: WorkshopMod[]
  playsets: Playset[]
  inspect: Inspection
  detect: unknown
  index: unknown
  refresh: unknown
  register: unknown
  remove: unknown
}
export interface Progress {
  phase?: string
  detail?: string
  filesTotal?: number
  filesDone?: number
  bytes?: number
  total?: number | null
}
export type EngineEvent =
  | { apiVersion: number; type: 'result'; data: unknown }
  | {
      apiVersion: number
      type: 'error'
      data: { message: string; code: string }
    }
  | { apiVersion: number; type: 'log'; data: { message: string } }
  | { apiVersion: number; type: 'progress'; data: Progress }
export type TaskEvent = EngineEvent | ({ type: 'download' } & Progress)
export type TaskState =
  | 'queued'
  | 'running'
  | 'cancelling'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
export interface Task {
  id: string
  kind: string
  key: string
  input: Omit<ManagementRequest, 'operation'> & { operation?: string }
  state: TaskState
  createdAt: string
  startedAt?: string
  finishedAt?: string
  events: string[]
  progress?: Progress
  result?: unknown
  warnings?: string[]
  error?: string
  code?: string
}
export type EngineStatus =
  | {
      ready: true
      executable: string
      capabilities: Capabilities
      error?: never
      code?: never
    }
  | {
      ready: false
      error: string
      code: string
      executable?: never
      capabilities?: never
    }
export interface Session {
  id: string
  title: string
  index?: string
  loaded?: boolean
}
export interface ServiceState {
  engine: EngineStatus
  registry: Registry
  environment?: Environment
  tasks: Task[]
  bindings: Record<string, string | null | undefined>
  sessions: Session[]
  home: string
}
export interface ManagementResponses extends Omit<
  EngineResponses,
  'index' | 'refresh'
> {
  state: ServiceState
  tasks: Task[]
  cancel_task: Task
  index: Task
  refresh: Task
  configure: EngineStatus
  bind: { sessionId: string; index: string | null }
  unbind: { sessionId: string; index: string | null }
}
export type Api = <K extends keyof ManagementResponses>(
  request: ManagementRequest & { operation: K },
  signal?: AbortSignal,
) => Promise<ManagementResponses[K]>
export interface EngineAsset {
  file?: string
  url?: string
  sha256: string
}
export interface EnginePackage {
  name: string
  version: string
}
export interface EngineManifest {
  apiVersion: number
  engineVersion?: string
  sourceTag?: string
  sourceCommit: string
  build?: { sdkVersion: string; sourcePathPolicy?: string }
  packages?: Record<string, EnginePackage>
  assets?: Record<string, EngineAsset>
}
export interface EngineReceipt extends EngineAsset {
  apiVersion: number
  sourceCommit: string
  build?: EngineManifest['build']
  rid: string
  package?: EnginePackage
  installedAt: string
}
export interface PlatformReceipt extends Omit<EngineManifest, 'assets'> {
  formatVersion: 2
  rid: string
  entryPoint: string
  files: Record<string, string>
  asset?: EngineAsset
}
