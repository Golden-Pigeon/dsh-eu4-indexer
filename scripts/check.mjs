import { readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    if (result.signal)
      console.error(`Check stopped by ${result.signal}: ${args.join(' ')}`)
    process.exit(result.status ?? 1)
  }
}
async function walk(dir) {
  const result = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) result.push(...(await walk(p)))
    else if (/\.(m?js)$/.test(p)) result.push(p)
  }
  return result
}
for (const file of [
  ...(await walk('src')),
  ...(await walk('scripts')),
  ...(await walk('tests')),
]) {
  run(['--check', file])
}
for (const args of [
  ['scripts/build.mjs'],
  ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.check.json'],
  [
    '--test',
    ...(await walk('tests').then((files) =>
      files.filter((f) => !f.includes(`${path.sep}integration${path.sep}`)),
    )),
  ],
]) {
  run(args)
}
