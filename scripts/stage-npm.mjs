import { readFile, appendFile } from 'node:fs/promises'
import path from 'node:path'
import { stageUpdates } from './lib/npm-staging.mjs'
import { readReleaseReceipt } from './lib/release-receipt.mjs'
import { stagingRunner } from './lib/npm-staging-runner.mjs'
import { releaseTag } from './lib/release.mjs'

const root = path.resolve(import.meta.dirname, '..')
const { version } = JSON.parse(await readFile(path.join(root, 'package.json')))
const tag = releaseTag(version)
if (!process.env.NODE_AUTH_TOKEN)
  throw new Error('Configure the NPM_STAGE_TOKEN GitHub secret before staging')
const token = process.env.NODE_AUTH_TOKEN
delete process.env.NODE_AUTH_TOKEN
const packages = await readReleaseReceipt(root, process.env.GITHUB_SHA)
const runner = await stagingRunner({ npmCli: process.env.NPM_STAGE_CLI, token })
const summary = process.env.GITHUB_STEP_SUMMARY
try {
  if (summary)
    await appendFile(
      summary,
      '## npm staging\n\nIN PROGRESS: do not approve any packages until this job reports COMPLETE.\n\n| Package | Tag | Stage ID | Integrity |\n| --- | --- | --- | --- |\n',
    )
  await stageUpdates({
    packages,
    tag,
    runNpm: runner.runNpm,
    async onStaged({ name, version, tag, stageId, integrity }) {
      console.log(`Staged ${name}@${version}: ${stageId}`)
      if (summary)
        await appendFile(
          summary,
          `| ${name}@${version} | ${tag} | ${stageId} | ${integrity} |\n`,
        )
    },
    async onPublished({ name, version }) {
      console.log(`Already public: ${name}@${version}`)
      if (summary)
        await appendFile(
          summary,
          `| ${name}@${version} | — | Already public | — |\n`,
        )
    },
  })
} catch (error) {
  if (summary)
    await appendFile(
      summary,
      '\nStaging stopped. Some packages may already be staged. Inspect npm before retrying; CI will never approve or reject them.\n',
    )
  throw error
} finally {
  await runner.close()
}
if (summary)
  await appendFile(
    summary,
    '\nCOMPLETE: all nine packages are staged or already public. Review pending stages on npm, approve pending engines first, and approve the main package last with 2FA.\n',
  )
