import { spawnSync } from 'node:child_process'
import { mkdir, readFile, rm, chmod } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { rid, platforms } from '../dist/engine/platforms.js'
import { collectLicenses } from './lib/licenses.mjs'
import { verifyUpstreamSource } from './lib/upstream-source.mjs'
import { stageEngineSource, verifyEnginePrivacy } from './lib/engine-source.mjs'
import { prepareEnginePackage } from './lib/engine-package.mjs'
const args = process.argv.slice(2)
const targets = args.includes('--all')
  ? Object.keys(platforms)
  : args.length
    ? args
    : [rid()]
const root = path.resolve(import.meta.dirname, '..'),
  upstream = path.join(root, 'external/eu4-indexer')
const lock = JSON.parse(
  await readFile(path.join(root, 'engine.lock.json'), 'utf8'),
)
verifyUpstreamSource(root, lock)
if (lock.build?.sourcePathPolicy !== 'neutral-staging-v1')
  throw new Error('Update the engine lock source path policy before building')
const sdk = spawnSync('dotnet', ['--version'], { cwd: root, encoding: 'utf8' })
if (sdk.error) throw sdk.error
if (sdk.status !== 0 || sdk.stdout.trim() !== lock.build?.sdkVersion)
  throw new Error(
    `Expected .NET SDK ${lock.build?.sdkVersion}; check global.json and the installed SDK`,
  )
const staged = await stageEngineSource(root, upstream)
try {
  for (const target of targets) {
    if (!platforms[target]) throw new Error(`Invalid RID: ${target}`)
    const out = path.join(root, 'artifacts/engine', target)
    await rm(out, { recursive: true, force: true })
    await mkdir(out, { recursive: true })
    const build = spawnSync(
      'dotnet',
      [
        'publish',
        path.join(staged.source, 'Eu4Indexer.Cli/Eu4Indexer.Cli.fsproj'),
        '-c',
        'Release',
        '-r',
        target,
        '--self-contained',
        'true',
        '--disable-build-servers',
        '-p:UseSharedCompilation=false',
        '-p:PublishSingleFile=false',
        '-p:PublishTrimmed=false',
        '-p:ContinuousIntegrationBuild=true',
        '-p:NuGetAudit=false',
        '-o',
        path.join(out, 'bin'),
      ],
      { cwd: path.dirname(staged.source), stdio: 'inherit' },
    )
    if (build.error) throw build.error
    if (build.status !== 0)
      throw new Error(`dotnet publish failed: ${build.signal ?? build.status}`)
    if (!target.startsWith('win-'))
      await chmod(path.join(out, 'bin/eu4indexer'), 0o755)
    await verifyEnginePrivacy(path.join(out, 'bin'), [root, os.homedir()])
    await collectLicenses(root, staged.source, target, path.join(out, 'bin'))
    await prepareEnginePackage(root, target)
  }
} finally {
  await staged.cleanup()
}
console.log('Built platform engine packages; no release was published.')
