import path from 'node:path'
import { localRegistry } from './lib/package-registry.mjs'
const { server, url } = await localRegistry(
  path.resolve(import.meta.dirname, '..'),
  Number(process.env.DSH_EU4_REGISTRY_PORT ?? 4873),
)
console.log(
  `Local tarball registry: ${url} (read-only, loopback only; nothing is published)`,
)
for (const event of ['SIGINT', 'SIGTERM'])
  process.on(event, () => server.close())
