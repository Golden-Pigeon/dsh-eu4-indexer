import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { platforms } from '../dist/engine/platforms.js'
import { verifyUpstreamSource } from './lib/upstream-source.mjs'
const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json')))
const lock = JSON.parse(await readFile(path.join(root, 'engine.lock.json')))
verifyUpstreamSource(root, lock)
const engineVersion = lock.engineVersion
lock.packages = {}
delete lock.assets
delete lock.releaseRepository
pkg.optionalDependencies = {}
for (const [rid, platform] of Object.entries(platforms)) {
  const dir = path.join(root, 'packages', `engine-${rid}`)
  await mkdir(dir, { recursive: true })
  const manifest = {
    name: platform.name,
    version: engineVersion,
    description: `Self-contained EU4/HOI4 indexer engine for ${rid}.`,
    license: 'MIT',
    author: pkg.author,
    ...platform,
    engines: { node: pkg.engines.node },
    exports: { './package.json': './package.json' },
    scripts: { prepack: `node ../../scripts/verify-engine-package.mjs ${rid}` },
    files: [
      'engine.json',
      'bin',
      'LICENSE',
      'README.md',
      'THIRD-PARTY-NOTICES.md',
      'third-party',
    ],
    repository: { ...pkg.repository, directory: `packages/engine-${rid}` },
  }
  await writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  )
  await copyFile(path.join(root, 'LICENSE'), path.join(dir, 'LICENSE'))
  await writeFile(
    path.join(dir, 'README.md'),
    `# ${platform.name}\n\nEU4/HOI4 indexer ${engineVersion} for ${rid}, matching the upstream engine version. Installed and updated automatically through the exact optionalDependencies of ${pkg.name}, which has its own version. The bin/ directory contains the complete, directly runnable .NET publish output; no .NET SDK, postinstall script or separate engine activation is required. The Node library is available from ${pkg.name}/engine.\n\nThe wrapper is MIT licensed. Bundled components retain their own licenses; see THIRD-PARTY-NOTICES.md and third-party/.\n`,
  )
  lock.packages[rid] = { name: platform.name, version: engineVersion }
  pkg.optionalDependencies[platform.name] = engineVersion
}
await writeFile(
  path.join(root, 'engine.lock.json'),
  JSON.stringify(lock, null, 2) + '\n',
)
await writeFile(
  path.join(root, 'package.json'),
  JSON.stringify(pkg, null, 2) + '\n',
)
// Keep complete platform metadata in the lockfile while these optional packages
// are unpublished. Development builds its own engines and omits optional packages.
const npmLockPath = path.join(root, 'package-lock.json')
const npmLock = JSON.parse(await readFile(npmLockPath))
for (const name of Object.keys(npmLock.packages[''].optionalDependencies ?? {}))
  if (!Object.hasOwn(pkg.optionalDependencies, name))
    delete npmLock.packages[`node_modules/${name}`]
npmLock.name = pkg.name
npmLock.version = pkg.version
npmLock.packages[''].name = pkg.name
npmLock.packages[''].version = pkg.version
npmLock.packages[''].optionalDependencies = pkg.optionalDependencies
for (const platform of Object.values(platforms)) {
  npmLock.packages[`node_modules/${platform.name}`] = {
    version: engineVersion,
    resolved: `https://registry.npmjs.org/${platform.name}/-/${platform.name.split('/').at(-1)}-${engineVersion}.tgz`,
    optional: true,
    license: 'MIT',
    os: platform.os,
    cpu: platform.cpu,
    ...(platform.libc ? { libc: platform.libc } : {}),
  }
}
await writeFile(npmLockPath, JSON.stringify(npmLock, null, 2) + '\n')
