import { mkdtemp, writeFile, rm, lstat } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const diagnosticCodes = new Set([
  'E400',
  'E401',
  'E403',
  'E404',
  'E409',
  'E422',
  'E429',
  'E500',
  'E502',
  'E503',
  'E504',
  'EOTP',
  'ENEEDAUTH',
  'EUSAGE',
  'EPUBLISHCONFLICT',
  'EACCES',
  'ENOENT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'ERR_SOCKET_TIMEOUT',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
])

function failureCode(stdout) {
  try {
    const code = JSON.parse(stdout).error?.code
    return diagnosticCodes.has(code) ? `; npm ${code}` : ''
  } catch {
    return ''
  }
}

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
    // libuv on Windows inherits PATH when it is absent; explicitly clear it.
    PATH: '',
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
  // Required by Node on Windows. PATH above blocks libuv's parent-path fallback.
  if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot
  return {
    async runNpm(args) {
      const version = args.length === 1 && args[0] === '--version'
      if (!version && !(args[0] === 'stage' && args[1] === 'publish'))
        throw new Error('Only npm version and stage publish are allowed')
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
                `npm staging command failed (${signal ?? code}; ${version ? 'version' : `stage ${args[1]}`}${overflow ? '' : failureCode(Buffer.concat(stdout).toString('utf8'))}); inspect npm before retrying`,
              ),
            )
          else resolve(Buffer.concat(stdout).toString('utf8'))
        })
      })
    },
    close: () => rm(cwd, { recursive: true, force: true }),
  }
}
