import { execFileSync } from 'node:child_process'
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
}
