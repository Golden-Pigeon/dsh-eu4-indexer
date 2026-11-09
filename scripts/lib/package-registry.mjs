import http from 'node:http'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { platforms } from '../../dist/engine/platforms.js'
import { npmArchiveName } from './npm-package.mjs'

/** Read-only loopback registry for installing unpublished tarballs with their real dependency graph. */
export async function localRegistry(root, port = 0) {
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
      const item = metadata.get(name)
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
        npmArchiveName(name, item.manifest.version),
      )
      if (archiveRequest) {
        requested.push(item.target ?? 'main')
        res.setHeader('content-type', 'application/octet-stream')
        res.end(await readFile(file))
        return
      }
      const dist = {
        tarball: `http://127.0.0.1:${server.address().port}/tarballs/${encodeURIComponent(name)}.tgz`,
      }
      // Like a real registry, only advertise packages that actually exist.
      // An incomplete dist record makes pnpm fetch a tarball to discover its integrity.
      try {
        dist.integrity = `sha512-${createHash('sha512')
          .update(await readFile(file))
          .digest('base64')}`
      } catch (e) {
        if (e.code !== 'ENOENT') throw e
        res.writeHead(404).end('Platform package has not been built locally')
        return
      }
      res.setHeader('content-type', 'application/json')
      const version = item.manifest.version
      res.end(
        JSON.stringify({
          name,
          'dist-tags': { latest: version },
          time: { [version]: '2020-01-01T00:00:00Z' },
          versions: { [version]: { ...item.manifest, dist } },
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
