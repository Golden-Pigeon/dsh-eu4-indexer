import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import spawn from 'cross-spawn'
import os from 'node:os'
import path from 'node:path'
import { localRegistry } from './lib/package-registry.mjs'
import { npmArchiveName } from './lib/npm-package.mjs'

const root = path.resolve(import.meta.dirname, '..')
const desktop = process.argv.slice(2).includes('--desktop')
const packaged = process.argv.slice(2).includes('--package')
if (desktop && packaged)
  throw new Error('Packaged tests must use an isolated rc.1 install')
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code, signal) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} failed: ${signal ?? code}`)),
    )
  })
}

let temporary, server
try {
  let runtime, executable, env
  if (desktop) {
    const app =
      process.env.DSH_DESKTOP_APP ?? '/Applications/DeepSeek Harness.app'
    runtime =
      process.env.DSH_DESKTOP_RUNTIME ??
      path.join(app, 'Contents/Resources/app.asar/dsh')
    executable =
      process.env.DSH_DESKTOP_NODE ??
      path.join(app, 'Contents/MacOS/DeepSeek Harness')
    env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  } else {
    temporary = await mkdtemp(path.join(os.tmpdir(), 'dsh-rc1-dependencies-'))
    runtime = temporary
    executable = process.execPath
    env = { ...process.env }
    await writeFile(
      path.join(runtime, 'package.json'),
      JSON.stringify({
        private: true,
        type: 'module',
        dependencies: {
          '@deepseek-ai/cordis': '4.1.0',
          '@deepseek-ai/schemastery': '3.19.0',
          ...Object.fromEntries(
            [
              'mcp-client',
              'client-connection',
              'scope',
              'system-prompt',
              'tools',
              'skill',
              'tool-skill',
            ].map((name) => [`@deepseek-ai/dsh-${name}`, '0.2.2-rc.1']),
          ),
        },
      }),
    )
    // Deliberately outside this repository: its root overrides must not apply.
    const npmArgs = [
      'install',
      '--ignore-scripts',
      '--omit=optional',
      '--no-audit',
      '--no-fund',
    ]
    const npm = async (args) => {
      if (process.env.npm_execpath)
        await run(process.execPath, [process.env.npm_execpath, ...args], {
          cwd: runtime,
        })
      else await run('npm', args, { cwd: runtime })
    }
    await npm(npmArgs)
    if (packaged) {
      const pkg = JSON.parse(await readFile(path.join(root, 'package.json')))
      const archive = path.join(
        root,
        'artifacts/npm',
        npmArchiveName(pkg.name, pkg.version),
      )
      const registry = await localRegistry(root)
      server = registry.server
      await npm([
        'install',
        '--ignore-scripts',
        '--include=optional',
        '--no-audit',
        '--no-fund',
        `--registry=${registry.url}`,
        archive,
      ])
      env.DSH_TEST_PLUGIN_ROOT = path.join(runtime, 'node_modules', pkg.name)
      console.log(
        'Testing the installed npm tarball against the original rc.1 runtime',
      )
    }
  }
  const tests = (await readdir(path.join(root, 'tests/integration')))
    .filter((name) => name.endsWith('.test.mjs'))
    .map((name) => path.join(root, 'tests/integration', name))
  await run(
    executable,
    [
      '--expose-internals',
      '--import',
      new URL('./lib/dsh-rc1-loader.mjs', import.meta.url).href,
      '--test',
      ...tests,
    ],
    {
      cwd: root,
      env: { ...env, DSH_TEST_RC1_RUNTIME: runtime },
    },
  )
} finally {
  if (server) await new Promise((resolve) => server.close(resolve))
  if (temporary) await rm(temporary, { recursive: true, force: true })
}
