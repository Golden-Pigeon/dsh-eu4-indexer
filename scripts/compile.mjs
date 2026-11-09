import { rm, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import ts from 'typescript'

const root = path.resolve(import.meta.dirname, '..')
/** Emit in memory so release verification checks current TS without mutating dist. */
export function compiledFiles(directory = root) {
  const config = ts.readConfigFile(
    path.join(directory, 'tsconfig.json'),
    ts.sys.readFile,
  )
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, directory)
  const program = ts.createProgram(parsed.fileNames, parsed.options)
  const diagnostics = [
    ...(config.error ? [config.error] : []),
    ...parsed.errors,
    ...ts.getPreEmitDiagnostics(program),
  ]
  if (diagnostics.length)
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => directory,
        getNewLine: () => '\n',
      }),
    )
  const files = new Map()
  const result = program.emit(undefined, (file, contents) => {
    files.set(
      path.relative(directory, file).split(path.sep).join('/'),
      Buffer.from(contents),
    )
  })
  if (result.emitSkipped)
    throw new Error('TypeScript compilation did not emit the release files')
  return files
}
export async function compile() {
  // Failed validation must leave the last runnable build intact. Only replace
  // output once all current sources have passed checks and emitted in memory.
  const files = compiledFiles()
  // Deleted TypeScript modules must never survive a successful release build.
  await rm(path.join(root, 'dist'), { recursive: true, force: true })
  for (const [relative, contents] of files) {
    const file = path.join(root, relative)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, contents)
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await compile()
