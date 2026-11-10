import http from 'node:http'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { platforms } from '../../dist/engine/platforms.js'
import { npmArchiveName } from './npm-package.mjs'

/** Read-only loopback registry for installing unpublished tarballs with their real dependency graph. */
export async function localRegistry(root, port = 0, previousVersions = []) {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json')))
  const metadata = new Map([[pkg.name, { manifest: pkg }]])
  const requested = []
  for (const target of Object.keys(platforms)) {
    const manifest = JSON.parse(
      await readFile(
        path.join(root, 'packages', `engine-${target}`, 'package.json'),
      ),
    )
    metadata.set(manifest.name, { target, manifest })
  }
  const readPrevious = (name, version) => {
    if (
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(
        version ?? '',
      )
    )
      throw new Error('Invalid fixture version')
    const file = path.join(root, 'artifacts/npm', npmArchiveName(name, version))
    const old = JSON.parse(
      execFileSync('tar', ['-xOf', file, 'package/package.json'], {
        maxBuffer: 4 * 1024 * 1024,
      }),
    )
    if (old.name !== name || old.version !== version)
      throw new Error('Incorrect upgrade fixture')
    return old
  }
  const previous = previousVersions.map((version) =>
    readPrevious(pkg.name, version),
  )
  const archives = new Map()
  for (const [name, item] of metadata) {
    item.versions = [item.manifest]
    for (const main of previous) {
      const version =
        name === pkg.name ? main.version : main.optionalDependencies?.[name]
      if (!item.versions.some((manifest) => manifest.version === version))
        item.versions.push(
          name === pkg.name ? main : readPrevious(name, version),
        )
    }
    for (const manifest of item.versions) {
      archives.set(`${name}@${manifest.version}`, { ...item, manifest })
    }
  }
  const server = http.createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405).end()
        return
      }
      const url = new URL(req.url, 'http://localhost')
      const archiveRequest = url.pathname.startsWith('/tarballs/')
      const name = archiveRequest
        ? decodeURIComponent(url.pathname.slice('/tarballs/'.length, -4))
        : decodeURIComponent(url.pathname.slice(1))
      // Versioned tarball routes allow upgrade tests to retain the old release.
      const item = archiveRequest
        ? (archives.get(name) ?? metadata.get(name))
        : metadata.get(name)
      if (!item) {
        if (archiveRequest) {
          res.writeHead(404).end()
          return
        }
        res
          .writeHead(302, {
            location: `https://registry.npmjs.org${url.pathname}${url.search}`,
          })
          .end()
        return
      }
      const file = path.join(
        root,
        'artifacts/npm',
        npmArchiveName(item.manifest.name, item.manifest.version),
      )
      if (archiveRequest) {
        requested.push(item.target ?? 'main')
        res.setHeader('content-type', 'application/octet-stream')
        res.end(await readFile(file))
        return
      }
      // Like a real registry, only advertise packages that actually exist.
      // An incomplete dist record makes pnpm fetch a tarball to discover its integrity.
      const versions = {}
      for (const manifest of item.versions) {
        try {
          const archive = path.join(
            root,
            'artifacts/npm',
            npmArchiveName(name, manifest.version),
          )
          versions[manifest.version] = {
            ...manifest,
            dist: {
              tarball: `http://127.0.0.1:${server.address().port}/tarballs/${encodeURIComponent(`${name}@${manifest.version}`)}.tgz`,
              integrity: `sha512-${createHash('sha512')
                .update(await readFile(archive))
                .digest('base64')}`,
            },
          }
        } catch (e) {
          if (e.code !== 'ENOENT') throw e
        }
      }
      if (!Object.keys(versions).length) {
        res.writeHead(404).end('Platform package has not been built locally')
        return
      }
      res.setHeader('content-type', 'application/json')
      const version = item.manifest.version
      res.end(
        JSON.stringify({
          name,
          'dist-tags': { latest: version },
          time: Object.fromEntries(
            Object.keys(versions).map((version) => [
              version,
              '2020-01-01T00:00:00Z',
            ]),
          ),
          versions,
        }),
      )
    } catch (error) {
      res.writeHead(500).end(error.message)
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  return { server, requested, url: `http://127.0.0.1:${server.address().port}` }
}
