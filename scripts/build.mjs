import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises'
import path from 'node:path'
import { compile } from './compile.mjs'
import { renderDshSkill } from './lib/skill.mjs'
import { verifyUpstreamSource } from './lib/upstream-source.mjs'
const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json')))
const lock = JSON.parse(await readFile(path.join(root, 'engine.lock.json')))
verifyUpstreamSource(root, lock)
const sdk = JSON.parse(await readFile(path.join(root, 'global.json')))
if (sdk.sdk.version !== lock.build?.sdkVersion)
  throw new Error('global.json SDK does not match engine.lock.json')
await compile()
const { platforms } = await import('../dist/engine/platforms.js')
if (Object.keys(lock.packages).length !== Object.keys(platforms).length)
  throw new Error('Run npm run prepare:engines after changing platforms')
for (const [target, platform] of Object.entries(platforms)) {
  if (
    pkg.optionalDependencies?.[platform.name] !== lock.engineVersion ||
    lock.packages[target]?.version !== lock.engineVersion ||
    lock.packages[target]?.name !== platform.name
  )
    throw new Error(
      `Stale engine dependency ${target}; run npm run prepare:engines`,
    )
}
for (const game of ['eu4', 'hoi4'])
  for (const language of ['en', 'zh']) {
    const source = path.join(
      root,
      'external/eu4-indexer/skills/eu4-indexer',
      game,
      language,
      'SKILL.md',
    )
    const out = path.join(root, 'resources/skills', game, language)
    await mkdir(out, { recursive: true })
    await writeFile(
      path.join(out, 'SKILL.md'),
      renderDshSkill(await readFile(source, 'utf8'), game, language),
    )
  }
await cp(
  path.join(root, 'external/eu4-indexer/LICENSE'),
  path.join(root, 'resources/UPSTREAM-LICENSE'),
)
await mkdir(path.join(root, 'resources/docs'), { recursive: true })
await cp(
  path.join(root, 'external/eu4-indexer/docs/management.md'),
  path.join(root, 'resources/docs/management.md'),
)
await cp(
  path.join(root, 'external/eu4-indexer/docs/dependencies.md'),
  path.join(root, 'resources/docs/dependencies.md'),
)
console.log('Built four game/language skills from the pinned submodule.')
// Remove obsolete bundles so a previous local build cannot bloat the main npm package.
await rm(path.join(root, 'resources/archives'), {
  recursive: true,
  force: true,
})
await rm(path.join(root, 'resources/engine'), { recursive: true, force: true })
