import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { rid } from '../src/engine/runtime.js'
const targets = process.argv.slice(2).length ? process.argv.slice(2) : [rid()]
const root = path.resolve(import.meta.dirname, '..'),
  upstream = path.join(root, 'external/eu4-indexer')
const git = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: upstream,
  encoding: 'utf8',
})
if (git.status) throw new Error(git.stderr)
const dirty = spawnSync('git', ['status', '--porcelain'], {
  cwd: upstream,
  encoding: 'utf8',
})
if (dirty.status || dirty.stdout.trim())
  throw new Error(
    'Commit upstream changes locally before building, so the engine lock identifies its exact source',
  )
const lock = JSON.parse(
  await readFile(path.join(root, 'engine.lock.json'), 'utf8'),
)
lock.sourceCommit = git.stdout.trim()
for (const target of targets) {
  if (!/^(win|linux|osx)-(x64|arm64)$/.test(target))
    throw new Error(`Invalid RID: ${target}`)
  const out = path.join(root, 'artifacts/engine', target)
  await mkdir(out, { recursive: true })
  const build = spawnSync(
    'dotnet',
    [
      'publish',
      path.join(upstream, 'Eu4Indexer.Cli/Eu4Indexer.Cli.fsproj'),
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
      '-p:NuGetAudit=false',
      '-o',
      path.join(out, 'bin'),
    ],
    { stdio: 'inherit' },
  )
  if (build.status) process.exit(build.status)
  const artifact = path.join(
    root,
    'artifacts',
    `eu4indexer-${target}${target.startsWith('win') ? '.zip' : '.tar.gz'}`,
  )
  const windowsPack =
    process.platform === 'win32'
      ? () =>
          spawnSync(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              `Compress-Archive -Path bin -DestinationPath '${artifact.replaceAll("'", "''")}' -Force`,
            ],
            { cwd: out, stdio: 'inherit' },
          )
      : () =>
          spawnSync('zip', ['-qr', artifact, 'bin'], {
            cwd: out,
            stdio: 'inherit',
          })
  const pack = target.startsWith('win')
    ? windowsPack()
    : spawnSync('tar', ['-czf', artifact, '-C', out, 'bin'], {
        stdio: 'inherit',
      })
  if (pack.status) process.exit(pack.status)
  const sha256 = createHash('sha256')
    .update(await readFile(artifact))
    .digest('hex')
  lock.assets[target] = {
    file: path.basename(artifact),
    url: `https://github.com/${lock.releaseRepository}/releases/download/v0.1.0/${path.basename(artifact)}`,
    sha256,
  }
}
await writeFile(
  path.join(root, 'engine.lock.json'),
  JSON.stringify(lock, null, 2) + '\n',
)
console.log(
  'Built self-contained engines and updated engine.lock.json; no release was published.',
)
