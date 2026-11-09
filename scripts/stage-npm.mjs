import { readFile, appendFile } from 'node:fs/promises'
import path from 'node:path'
import { stageUpdates } from './lib/npm-staging.mjs'
import { readReleaseReceipt } from './lib/release-receipt.mjs'
import { stagingRunner } from './lib/npm-staging-runner.mjs'

const root = path.resolve(import.meta.dirname, '..')
if (
  process.env.GITHUB_ACTIONS !== 'true' ||
  process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
  !process.env.DEFAULT_BRANCH ||
  process.env.GITHUB_REF !== `refs/heads/${process.env.DEFAULT_BRANCH}`
)
  throw new Error(
    'npm staging is restricted to a manual run on the default branch',
  )
if (!process.env.NODE_AUTH_TOKEN)
  throw new Error('Configure the NPM_STAGE_TOKEN GitHub secret before staging')
const token = process.env.NODE_AUTH_TOKEN
delete process.env.NODE_AUTH_TOKEN
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH))
if (![true, 'true'].includes(event.inputs?.stage))
  throw new Error('The workflow must explicitly request npm staging')
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
    tag: process.env.NPM_DIST_TAG,
    runNpm: runner.runNpm,
    async onStaged({ name, version, tag, stageId, integrity }) {
      console.log(`Staged ${name}@${version}: ${stageId}`)
      if (summary)
        await appendFile(
          summary,
          `| ${name}@${version} | ${tag} | ${stageId} | ${integrity} |\n`,
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
    '\nCOMPLETE: all nine packages were staged. Review on npm, approve all eight engines first, and approve the main package last with 2FA.\n',
  )
