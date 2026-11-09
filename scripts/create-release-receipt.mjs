import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  writeReleaseReceipt,
  readReleaseReceipt,
} from './lib/release-receipt.mjs'

const root = path.resolve(import.meta.dirname, '..')
if (process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN)
  throw new Error('Release validation must run without npm credentials')
// Freeze the expected digests before validation; never bless changed bytes afterwards.
await writeReleaseReceipt(root, process.env.GITHUB_SHA)
execFileSync(
  process.execPath,
  [path.join(root, 'scripts/verify-release.mjs')],
  { cwd: root, stdio: 'inherit' },
)
await readReleaseReceipt(root, process.env.GITHUB_SHA)
console.log('Recorded the verified nine-package release set and source commit')
