import type * as React from 'react'
import type {
  Api,
  ManagementRequest,
  ManagementResponses,
  Game,
} from '../contracts.js'

/** The rc.1 browser loader provides React and these host services at activation. */
export interface ClientContext {
  effect(setup: () => void | (() => void | Promise<void>)): unknown
  locale: {
    register(
      name: string,
      dictionaries: Record<string, Record<string, string>>,
    ): void | (() => void)
    bind(name: string): (key: string) => string
  }
  connection: {
    rpc: {
      call<K extends keyof ManagementResponses>(
        route: string,
        endpoint: string,
        request: ManagementRequest & { operation: K },
        signal?: AbortSignal,
      ): Promise<
        | { ok: true; value: ManagementResponses[K] }
        | { ok: false; error: { message: string } }
      >
    }
  }
  slots: {
    inject(name: string, setup: () => unknown): unknown
    register(
      options: { name: string; key: string; locale: string },
      view: React.ComponentType<{ view?: string }>,
    ): unknown
  }
}
export interface PageProps {
  api: Api
  t: (key: string) => string
  summary?: boolean
}
export interface Form {
  game: Game
  name: string
  gameDir: string
  configDir: string
  mods: string
  workshopIds: string[]
  playset: string
  languages: string
  autoMods: boolean
  skipGeneric: boolean
  noFts: boolean
}
export type TextField = {
  [K in keyof Form]: Form[K] extends string ? K : never
}[keyof Form]
export type CheckField = {
  [K in keyof Form]: Form[K] extends boolean ? K : never
}[keyof Form]
export interface ModuleLoader {
  load(entry: {
    id: string
    factory(require: (name: 'react') => typeof React): {
      inject: string[]
      apply(ctx: ClientContext): void
      Page: React.ComponentType<PageProps>
    }
  }): void
}
