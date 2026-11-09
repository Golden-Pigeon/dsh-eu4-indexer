import { readFile, mkdir } from 'node:fs/promises'
import spawn from 'cross-spawn'
import path from 'node:path'
import { platforms, rid } from '../dist/engine/platforms.js'
import { verifyEnginePackage } from './verify-engine-package.mjs'
const root = path.resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const targets = args.includes('--all')
  ? Object.keys(platforms)
  : args.length
    ? args
    : [rid()]
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
await mkdir(path.join(root, 'artifacts/npm'), { recursive: true })
for (const target of targets) {
  if (!platforms[target]) throw new Error(`Unknown engine target: ${target}`)
  const dir = path.join(root, 'packages', `engine-${target}`)
  await verifyEnginePackage(target)
  const run = spawn.sync(
    npm,
    ['pack', '--pack-destination', path.join(root, 'artifacts/npm')],
    { cwd: dir, stdio: 'inherit' },
  )
  if (run.error) throw run.error
  if (run.status !== 0)
    throw new Error(`npm pack failed: ${run.signal ?? run.status}`)
}
