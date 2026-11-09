import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { platforms } from '../dist/engine/platforms.js'
const root = path.resolve(import.meta.dirname, '..')
export async function verifyEnginePackage(target) {
  if (!platforms[target]) throw new Error(`Unknown engine target: ${target}`)
  const dir = path.join(root, 'packages', `engine-${target}`)
  const lock = JSON.parse(await readFile(path.join(root, 'engine.lock.json')))
  const pkg = JSON.parse(await readFile(path.join(dir, 'package.json')))
  const receipt = JSON.parse(await readFile(path.join(dir, 'engine.json')))
  if (
    receipt.rid !== target ||
    receipt.apiVersion !== lock.apiVersion ||
    receipt.sourceCommit !== lock.sourceCommit ||
    !isDeepStrictEqual(receipt.build, lock.build) ||
    pkg.name !== lock.packages[target].name ||
    pkg.version !== lock.packages[target].version
  )
    throw new Error(`Stale engine package ${target}; rebuild it`)
  const expected = target.startsWith('win') ? 'engine.zip' : 'engine.tar.gz'
  if (receipt.asset.file !== expected)
    throw new Error('Unexpected engine archive name')
  const bytes = await readFile(path.join(dir, receipt.asset.file))
  if (createHash('sha256').update(bytes).digest('hex') !== receipt.asset.sha256)
    throw new Error(`Corrupted engine archive ${target}`)
  await readFile(path.join(dir, 'third-party/cwtools/LICENSE'))
  await readFile(
    path.join(dir, 'third-party/dotnet-runtime/THIRD-PARTY-NOTICES.TXT'),
  )
  const inventory = JSON.parse(
    await readFile(path.join(dir, 'third-party/inventory.json')),
  )
  if (
    !inventory
      .find((item) => item.component === 'FParsec')
      ?.files.some((file) => file.endsWith('/UNICODE-LICENSE.txt'))
  )
    throw new Error('Missing the FParsec Unicode data license')
  for (const item of inventory)
    for (const file of item.files) {
      if (
        !file.startsWith('third-party/') ||
        file.includes('\\') ||
        file.split('/').includes('..')
      )
        throw new Error('Invalid third-party notice path')
      if (!(await readFile(path.join(dir, file))).length)
        throw new Error(`Empty third-party notice: ${file}`)
    }
  return pkg
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await verifyEnginePackage(process.argv[2])
