import { execFileSync } from 'node:child_process'
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

/** F# quotations/assertions can retain physical paths even with PathMap enabled. */
export async function stageEngineSource(root, upstream) {
  const base =
    process.env.DSH_EU4_BUILD_TEMP ??
    (process.platform === 'win32'
      ? path.join(
          process.env.PUBLIC ??
            `${process.env.SystemDrive ?? 'C:'}\\Users\\Public`,
          'Documents',
        )
      : '/tmp')
  await mkdir(base, { recursive: true })
  const neutralBase = await realpath(base)
  const home = (await realpath(os.homedir())) + path.sep
  if ((neutralBase + path.sep).toLowerCase().startsWith(home.toLowerCase())) {
    throw new Error(
      'DSH_EU4_BUILD_TEMP must be outside the personal home directory',
    )
  }
  const temp = await mkdtemp(path.join(neutralBase, 'dsh-eu4-build-'))
  const source = path.join(temp, 'source')
  try {
    await cp(path.join(root, 'global.json'), path.join(temp, 'global.json'))
    for (const relative of ['', 'external/cwtools']) {
      const repo = path.join(upstream, relative)
      const files = execFileSync('git', ['ls-files', '-z'], {
        cwd: repo,
        encoding: 'utf8',
      }).split('\0')
      for (const file of files.filter(Boolean)) {
        const input = path.join(repo, file)
        const info = await lstat(input)
        if (info.isDirectory()) continue // Git submodule; copied separately.
        if (!info.isFile())
          throw new Error(
            `Build source must be a regular file: ${relative}/${file}`,
          )
        const output = path.join(source, relative, file)
        await mkdir(path.dirname(output), { recursive: true })
        await cp(input, output)
      }
    }
    return { source, cleanup: () => rm(temp, { recursive: true, force: true }) }
  } catch (error) {
    await rm(temp, { recursive: true, force: true })
    throw error
  }
}

export async function verifyEnginePrivacy(directory, privateRoots) {
  for (const name of [
    'eu4indexer',
    'Eu4Indexer.Core',
    'Eu4Indexer.Mcp',
    'CWTools',
    'Shared',
    'CSharpHelpers',
  ]) {
    const bytes = await readFile(path.join(directory, `${name}.dll`))
    for (const value of privateRoots) {
      const normalized = path.resolve(value)
      for (const variant of new Set([
        normalized,
        normalized.replaceAll('\\', '/'),
        normalized.replaceAll('/', '\\'),
      ])) {
        for (const encoding of ['utf8', 'utf16le']) {
          if (bytes.includes(Buffer.from(variant, encoding)))
            throw new Error(
              `Private build path embedded in ${name}.dll; rebuild from neutral staging`,
            )
        }
      }
    }
  }
}
