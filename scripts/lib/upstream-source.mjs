import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/** Skills, docs and binaries must all come from the same clean, pinned source. */
export function verifyUpstreamSource(root, lock) {
  const cwd = path.join(root, 'external/eu4-indexer')
  const git = (args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  if (git(['rev-parse', 'HEAD']) !== lock.sourceCommit)
    throw new Error(
      'Update engine.lock.json sourceCommit to the pinned upstream commit before building',
    )
  if (git(['status', '--porcelain', '--ignore-submodules=none']))
    throw new Error(
      'Commit upstream changes locally before building, so the engine lock identifies its exact source',
    )
  const sourceVersion = readFileSync(
    path.join(cwd, 'Eu4Indexer.Core/AppInfo.fs'),
    'utf8',
  ).match(/^\s*let Version = "([^"]+)"\s*$/m)?.[1]
  if (
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(
      lock.engineVersion ?? '',
    ) ||
    sourceVersion !== lock.engineVersion
  )
    throw new Error(
      'engine.lock.json engineVersion must match the upstream AppInfo version',
    )
  if (
    lock.sourceTag &&
    (lock.sourceTag !== `v${lock.engineVersion}` ||
      git(['rev-parse', `${lock.sourceTag}^{commit}`]) !== lock.sourceCommit)
  )
    throw new Error(
      'engine.lock.json sourceTag must identify the pinned upstream release',
    )
}
