import type { Config } from '../../src/index.js'
import type { Api, Registry, Task } from '../../src/contracts.js'
import type { Form } from '../../src/client/host.js'

// These calls are compile-only. Expected errors ensure that the shared types
// keep distinguishing operations, response shapes and form field values.
export function checkContracts(api: Api, form: Form, config: Config) {
  const registry: Promise<Registry> = api({ operation: 'list' })
  const build: Promise<Task> = api({
    operation: 'index',
    game: 'eu4',
    name: 'base',
    mods: ['/mod'],
  })
  // @ts-expect-error A list response is a registry, not a task.
  const wrongResponse: Promise<Task> = api({ operation: 'list' })
  // @ts-expect-error Arbitrary shell operations are not management operations.
  void api({ operation: 'exec' })
  // @ts-expect-error Mod paths are an array, not a single string.
  void api({ operation: 'index', mods: '/mod' })
  // @ts-expect-error Only EU4 and HOI4 are supported by the build form.
  form.game = 'ck3'
  // @ts-expect-error The exported plugin configuration has numeric concurrency.
  config.concurrency = 'two'
  return { registry, build, wrongResponse }
}
