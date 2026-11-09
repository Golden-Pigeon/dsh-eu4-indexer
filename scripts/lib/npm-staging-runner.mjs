import { mkdtemp, writeFile, rm, lstat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

/** No project cwd, PATH-based npm lookup, inherited npm config, Node preloads, or debug logs. */
export async function stagingRunner({ npmCli, token }) {
  if (!path.isAbsolute(npmCli ?? '') || !(await lstat(npmCli)).isFile())
    throw new Error('The isolated npm CLI is missing')
  if (typeof token !== 'string' || !token || /[\r\n]/.test(token))
    throw new Error('Invalid staging credential')
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'dsh-npm-staging-runner-'))
  try {
    // Anchor npm's project search so it cannot discover a parent directory's .npmrc.
    await writeFile(path.join(cwd, 'package.json'), '{"private":true}\n', {
      mode: 0o600,
    })
    await writeFile(
      path.join(cwd, 'npmrc'),
      'registry=https://registry.npmjs.org/\n//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}\n',
      { mode: 0o600 },
    )
    await writeFile(path.join(cwd, 'global-npmrc'), '', { mode: 0o600 })
  } catch (error) {
    await rm(cwd, { recursive: true, force: true })
    throw error
  }
  const env = {
    TMPDIR: cwd,
    TEMP: cwd,
    TMP: cwd,
    NPM_CONFIG_USERCONFIG: path.join(cwd, 'npmrc'),
    NPM_CONFIG_GLOBALCONFIG: path.join(cwd, 'global-npmrc'),
    NPM_CONFIG_CACHE: path.join(cwd, 'cache'),
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    NPM_CONFIG_LOGS_MAX: '0',
    NPM_CONFIG_IGNORE_SCRIPTS: 'true',
  }
  // Required by Node on Windows; no other caller environment is forwarded.
  if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot
  return {
    async runNpm(args) {
      const version = args.length === 1 && args[0] === '--version'
      if (
        !version &&
        !(args[0] === 'stage' && ['list', 'publish'].includes(args[1]))
      )
        throw new Error(
          'Only npm version, stage list and stage publish are allowed',
        )
      return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [npmCli, ...args], {
          cwd,
          env: version ? env : { ...env, NODE_AUTH_TOKEN: token },
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 90_000,
          killSignal: 'SIGKILL',
        })
        const stdout = []
        let length = 0,
          overflow = false
        child.stdout.on('data', (data) => {
          length += data.length
          if (length > 4 * 1024 * 1024) {
            overflow = true
            child.kill('SIGKILL')
          } else stdout.push(data)
        })
        // Drain stderr without retaining or forwarding arbitrary credential-bearing output.
        child.stderr.resume()
        child.once('error', () =>
          reject(new Error('npm staging command could not start')),
        )
        child.once('close', (code, signal) => {
          if (code !== 0 || overflow)
            reject(
              new Error(
                `npm staging command failed (${signal ?? code}); inspect npm before retrying`,
              ),
            )
          else resolve(Buffer.concat(stdout).toString('utf8'))
        })
      })
    },
    close: () => rm(cwd, { recursive: true, force: true }),
  }
}
