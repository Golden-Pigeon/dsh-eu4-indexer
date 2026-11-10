import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { publishFiles } from '../../dist/engine/package.js'

/** Materialize npm's runnable payload from the verified complete publish output. */
export async function prepareEnginePackage(root, target) {
  const lock = JSON.parse(await readFile(path.join(root, 'engine.lock.json')))
  const out = path.join(root, 'artifacts/engine', target, 'bin')
  const directory = path.join(root, 'packages', `engine-${target}`)
  const pkg = JSON.parse(await readFile(path.join(directory, 'package.json')))
  if (
    pkg.version !== lock.packages[target].version ||
    pkg.name !== lock.packages[target].name
  )
    throw new Error('Engine package does not match the lock')
  await mkdir(directory, { recursive: true })
  await rm(path.join(directory, 'bin'), { recursive: true, force: true })
  await cp(out, path.join(directory, 'bin'), { recursive: true })
  await rm(path.join(directory, 'third-party'), {
    recursive: true,
    force: true,
  })
  await cp(path.join(out, 'third-party'), path.join(directory, 'third-party'), {
    recursive: true,
  })
  await cp(
    path.join(out, 'THIRD-PARTY-NOTICES.md'),
    path.join(directory, 'THIRD-PARTY-NOTICES.md'),
  )
  for (const legacy of ['engine.zip', 'engine.tar.gz'])
    await rm(path.join(directory, legacy), { force: true })
  const receipt = {
    formatVersion: 2,
    apiVersion: lock.apiVersion,
    sourceCommit: lock.sourceCommit,
    build: lock.build,
    rid: target,
    entryPoint: `bin/eu4indexer${target.startsWith('win-') ? '.exe' : ''}`,
    files: await publishFiles(directory),
  }
  await writeFile(
    path.join(directory, 'engine.json'),
    JSON.stringify(receipt, null, 2) + '\n',
  )
}
