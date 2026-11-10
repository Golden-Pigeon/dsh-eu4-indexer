import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { platforms, rid } from '../dist/engine/platforms.js'
test('npm dependencies map every supported OS, architecture and Linux libc to exactly one engine', async () => {
  const pkg = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url)),
  )
  const lock = JSON.parse(
    await readFile(new URL('../engine.lock.json', import.meta.url)),
  )
  const npmLock = JSON.parse(
    await readFile(new URL('../package-lock.json', import.meta.url)),
  )
  for (const os of ['darwin', 'win32', 'linux'])
    for (const arch of ['x64', 'arm64'])
      for (const libc of os === 'linux' ? ['glibc', 'musl'] : [undefined]) {
        const matches = Object.entries(platforms).filter(
          ([, p]) =>
            p.os.includes(os) &&
            p.cpu.includes(arch) &&
            (!p.libc || p.libc.includes(libc)),
        )
        assert.equal(matches.length, 1)
        const [target, meta] = matches[0]
        assert.equal(rid(os, arch, libc), target)
        assert.equal(pkg.optionalDependencies[meta.name], lock.engineVersion)
        assert.equal(lock.packages[target].name, meta.name)
        assert.equal(lock.packages[target].version, lock.engineVersion)
        assert.equal(
          npmLock.packages[`node_modules/${meta.name}`].version,
          lock.engineVersion,
        )
        const child = JSON.parse(
          await readFile(
            new URL(
              `../packages/engine-${target}/package.json`,
              import.meta.url,
            ),
          ),
        )
        assert.equal(child.version, lock.engineVersion)
        assert.deepEqual(child.os, meta.os)
        assert.deepEqual(child.cpu, meta.cpu)
        assert.deepEqual(child.libc, meta.libc)
      }
  assert.throws(() => rid('linux', 'arm64', 'unknown'), {
    code: 'unsupported_platform',
  })
  assert.throws(() => rid('freebsd', 'x64'), { code: 'unsupported_platform' })
})
