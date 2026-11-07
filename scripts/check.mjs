import { readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
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
  const run = spawnSync(process.execPath, ['--check', file], {
    stdio: 'inherit',
  })
  if (run.status) process.exit(run.status)
}
for (const args of [
  ['scripts/build.mjs'],
  [
    '--test',
    ...(await walk('tests').then((files) =>
      files.filter((f) => !f.includes(`${path.sep}integration${path.sep}`)),
    )),
  ],
]) {
  const run = spawnSync(process.execPath, args, { stdio: 'inherit' })
  if (run.status) process.exit(run.status)
}
