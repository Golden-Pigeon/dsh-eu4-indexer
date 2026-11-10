import { readFile, writeFile, mkdir, cp } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const decode = (text = '') =>
  text
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
const field = (xml, name) =>
  decode(
    xml.match(
      new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`),
    )?.[1] ?? '',
  )
const snapshots = {
  Argu: 'argu',
  'DotNet.Glob': 'dotnet.glob',
  FParsec: 'fparsec',
  'FSharp.Collections.ParallelSeq': 'fsharp.collections.parallelseq',
  'FSharp.Data': 'fsharp.data',
  'FSharpx.Collections': 'fsharpx.collections',
  FsPickler: 'fspickler',
  KTrie: 'ktrie',
  ModelContextProtocol: 'modelcontextprotocol',
  'ModelContextProtocol.Core': 'modelcontextprotocol',
  Npgsql: 'npgsql',
  'Sandwych.QuickGraph.Core': 'sandwych.quickgraph.core',
  SharpZipLib: 'sharpziplib',
  'VDS.Common': 'vds.common',
  ZString: 'zstring',
}

/** Fail closed on an unreviewed dependency; collect full texts and all packaged notices. */
export async function collectLicenses(root, upstream, target, bin) {
  const assets = JSON.parse(
    await readFile(
      path.join(upstream, 'Eu4Indexer.Cli/obj/project.assets.json'),
    ),
  )
  const folders = Object.keys(assets.packageFolders)
  const output = path.join(bin, 'third-party')
  await mkdir(output, { recursive: true })
  const inventory = []
  const reviewed = new Set(
    JSON.parse(
      await readFile(path.join(root, 'resources/third-party/components.json')),
    ),
  )
  const sources = JSON.parse(
    await readFile(path.join(root, 'resources/third-party/sources.json')),
  )
  const copy = async (source, name) => {
    const dest = path.join(output, name)
    await mkdir(path.dirname(dest), { recursive: true })
    await cp(source, dest)
    return `third-party/${name}`
  }
  for (const [key, library] of Object.entries(assets.libraries)) {
    if (library.type !== 'package') continue
    if (!reviewed.has(key))
      throw new Error(
        `Review the third-party license for ${key} before distributing it`,
      )
    const [id, version] = key.split('/')
    let directory
    for (const folder of folders) {
      try {
        await readFile(
          path.join(folder, library.path, `${id.toLowerCase()}.nuspec`),
        )
        directory = path.join(folder, library.path)
        break
      } catch (e) {
        if (e.code !== 'ENOENT') throw e
      }
    }
    if (!directory) throw new Error(`NuGet package is missing: ${key}`)
    const xml = await readFile(
      path.join(directory, `${id.toLowerCase()}.nuspec`),
      'utf8',
    )
    let snapshot = snapshots[id]
    if (id.startsWith('SQLitePCLRaw.')) snapshot = 'sqlitepclraw'
    if (/^(Microsoft\.|System\.|runtime\.|FSharp.Core$)/.test(id))
      snapshot = 'dotnet'
    if (!snapshot) throw new Error(`Review and add the license for ${key}`)
    const files = []
    for (const name of [
      snapshot,
      ...(id === 'FParsec' ? ['fparsec-unicode'] : []),
    ]) {
      const source = path.join(root, 'resources/third-party', `${name}.txt`)
      const licenseBytes = await readFile(source)
      if (
        createHash('sha256').update(licenseBytes).digest('hex') !==
        sources[name]?.sha256
      )
        throw new Error(`License snapshot checksum mismatch: ${name}`)
      files.push(
        await copy(
          source,
          `${id}-${version}/${name === snapshot ? 'LICENSE' : 'UNICODE-LICENSE'}.txt`,
        ),
      )
    }
    for (const file of library.files ?? []) {
      if (
        !/(?:license|notice|copying|copyright)/i.test(path.basename(file)) ||
        !/\.(txt|md|rst)$/i.test(file)
      )
        continue
      files.push(
        await copy(
          path.join(directory, file),
          `${id}-${version}/package-${path.basename(file)}`,
        ),
      )
    }
    inventory.push({
      component: id,
      version,
      license: field(xml, 'license'),
      copyright: field(xml, 'copyright'),
      authors: field(xml, 'authors'),
      files,
    })
  }
  const runtime = JSON.parse(
    await readFile(path.join(bin, 'eu4indexer.runtimeconfig.json')),
  ).runtimeOptions.includedFrameworks.find(
    (f) => f.name === 'Microsoft.NETCore.App',
  )
  if (!runtime) throw new Error('Expected a self-contained .NET runtime')
  const runtimeDir = path.join(
    folders[0],
    `microsoft.netcore.app.runtime.${target}`,
    runtime.version,
  )
  inventory.push({
    component: '.NET runtime',
    version: runtime.version,
    files: [
      await copy(
        path.join(runtimeDir, 'LICENSE.TXT'),
        'dotnet-runtime/LICENSE.TXT',
      ),
      await copy(
        path.join(runtimeDir, 'THIRD-PARTY-NOTICES.TXT'),
        'dotnet-runtime/THIRD-PARTY-NOTICES.TXT',
      ),
    ],
  })
  inventory.push({
    component: 'CWTools, CSharpHelpers, Shared',
    files: [
      await copy(
        path.join(upstream, 'external/cwtools/LICENSE'),
        'cwtools/LICENSE',
      ),
    ],
  })
  for (const game of ['eu4', 'hoi4']) {
    const name = `cwtools-${game}-config`
    inventory.push({
      component: name,
      license: 'MIT',
      files: [
        await copy(
          path.join(upstream, 'external', name, 'LICENSE'),
          `${name}/LICENSE`,
        ),
      ],
    })
  }
  inventory.push({
    component: 'eu4-indexer',
    files: [await copy(path.join(upstream, 'LICENSE'), 'eu4-indexer/LICENSE')],
  })
  await writeFile(
    path.join(bin, 'THIRD-PARTY-NOTICES.md'),
    '# Bundled third-party software\n\nEach component retains its own license. Full license and notice texts are included below third-party/. NuGet metadata records the original copyright and authors without replacing those notices.\n\n' +
      inventory
        .map(
          (item) =>
            `## ${item.component}${item.version ? ' ' + item.version : ''}\n\n${item.copyright ?? ''}\n${item.authors ?? ''}\n\n${item.files.map((f) => `- [${f}](${f})`).join('\n')}\n`,
        )
        .join('\n'),
  )
  await writeFile(
    path.join(output, 'inventory.json'),
    JSON.stringify(inventory, null, 2) + '\n',
  )
}
