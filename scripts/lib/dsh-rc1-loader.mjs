// Test-only resolution hook. Never imported by the published plugin.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const runtime = process.env.DSH_TEST_RC1_RUNTIME
assert.ok(runtime, 'DSH_TEST_RC1_RUNTIME is required')
const parentURL = pathToFileURL(path.join(runtime, 'package.json')).href
const runtimeURL = pathToFileURL(path.join(runtime, path.sep)).href
const require = createRequire(parentURL)
function version(name, from = require) {
  let directory = path.dirname(from.resolve(name))
  for (;;) {
    try {
      const manifest = JSON.parse(
        readFileSync(path.join(directory, 'package.json'), 'utf8'),
      )
      if (manifest.name === name) return manifest.version
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error
    }
    const parent = path.dirname(directory)
    assert.notEqual(parent, directory, `Cannot find manifest for ${name}`)
    directory = parent
  }
}
const versions = Object.fromEntries(
  [
    'mcp-client',
    'client-connection',
    'scope',
    'system-prompt',
    'tools',
    'skill',
    'tool-skill',
  ].map((name) => {
    const id = `@deepseek-ai/dsh-${name}`
    const actual = version(id)
    assert.equal(actual, '0.2.2-rc.1', `${id} must be the release baseline`)
    return [id, actual]
  }),
)
const clientRequire = createRequire(
  require.resolve('@deepseek-ai/dsh-mcp-client'),
)
const sdkRequire = createRequire(
  clientRequire.resolve('@modelcontextprotocol/client'),
)
versions['@deepseek-ai/cordis'] = version('@deepseek-ai/cordis')
versions['@deepseek-ai/schemastery'] = version('@deepseek-ai/schemastery')
versions['@modelcontextprotocol/client'] = version(
  '@modelcontextprotocol/client',
  clientRequire,
)
versions.undici = version('undici', sdkRequire)
versions.zod = version('zod', sdkRequire)
assert.equal(
  versions['@modelcontextprotocol/client'],
  '2.2.0',
  'Do not use the development SDK override',
)
console.log(
  'DSH rc.1 compatibility runtime:',
  JSON.stringify({ node: process.version, ...versions }),
)
const sourceURL = new URL('../../dist/', import.meta.url).href
const packedURL = process.env.DSH_TEST_PLUGIN_ROOT
  ? pathToFileURL(path.join(process.env.DSH_TEST_PLUGIN_ROOT, 'dist', path.sep))
      .href
  : undefined

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier.startsWith('@deepseek-ai/') &&
      !context.parentURL?.startsWith(runtimeURL)
    )
      return nextResolve(specifier, { ...context, parentURL })
    const resolved = nextResolve(specifier, context)
    return packedURL && resolved.url.startsWith(sourceURL)
      ? { ...resolved, url: packedURL + resolved.url.slice(sourceURL.length) }
      : resolved
  },
})
