import { readFile } from 'node:fs/promises'
import { releaseNotes, releaseTag } from './lib/release.mjs'

const root = new URL('../', import.meta.url)
const { version } = JSON.parse(await readFile(new URL('package.json', root)))
releaseTag(version)
const changelog = await readFile(new URL('CHANGELOG.md', root), 'utf8')
console.log(releaseNotes(changelog, version))
console.log(
  '\nCI stages npm updates for the maintainer to approve with 2FA. Approve pending engine packages before the main plugin.',
)
