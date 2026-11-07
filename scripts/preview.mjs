import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { IndexerService } from '../src/service.js'
import { createApi } from '../src/integration/http.js'
const home =
    process.env.DSH_EU4_PREVIEW_HOME ??
    path.join(os.tmpdir(), 'dsh-eu4-preview'),
  port = Number(process.env.DSH_EU4_PREVIEW_PORT ?? 3219)
const service = new IndexerService({
  home,
  executablePath: process.env.DSH_EU4_ENGINE ?? '',
  timeoutMs: 30000,
})
await service.init()
const api = createApi(service),
  root = path.resolve(import.meta.dirname, '..')
const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EU4 Indexer · DSH local preview</title><style>body{margin:0;background:#fafafa;color:#252b35;font-family:system-ui}#root{max-width:1040px;margin:28px auto;background:white;border:1px solid #ddd;border-radius:14px}</style><div id="root"></div><script src="/react.js"></script><script src="/react-dom.js"></script><script>window.__ModuleLoader__={load({factory}){const plugin=factory(n=>n==='react'?React:null);plugin.apply({locale:{register(_n,v){this.v=v},bind(){return key=>this.v.zh[key]||key}},connection:{rpc:{async call(_path,_endpoint,data,signal){const response=await fetch('/api/eu4-indexer',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data),signal});const result=await response.json();return response.ok?{ok:true,value:result}:{ok:false,error:{message:result.error}}}}},slots:{inject(_name,fn){fn()},register(_options,View){if(!window.mounted){window.mounted=true;ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(View,{view:'page'}))}}}})}};</script><script src="/client.js"></script></html>`
const server = http.createServer(async (req, res) => {
  try {
    const origin = req.headers.origin
    if (
      req.headers.host !== `127.0.0.1:${port}` ||
      (origin && origin !== `http://127.0.0.1:${port}`)
    ) {
      res.writeHead(403).end()
      return
    }
    const url = new URL(req.url, `http://127.0.0.1:${port}`)
    if (url.pathname === '/api/eu4-indexer') {
      let body = '',
        size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > 131072) {
          res.writeHead(413).end()
          return
        }
        body += chunk
      }
      const response = await api(
        new Request(url, {
          method: req.method,
          headers: req.headers,
          ...(body ? { body } : {}),
        }),
      )
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(await response.text())
      return
    }
    const files = {
      '/client.js': 'src/client/client.js',
      '/react.js': 'node_modules/react/umd/react.development.js',
      '/react-dom.js': 'node_modules/react-dom/umd/react-dom.development.js',
    }
    if (files[url.pathname]) {
      res.setHeader('content-type', 'text/javascript')
      res.end(await readFile(path.join(root, files[url.pathname])))
      return
    }
    if (url.pathname === '/') {
      res.setHeader('content-type', 'text/html;charset=utf-8')
      res.end(html)
      return
    }
    res.writeHead(404).end()
  } catch (error) {
    res.writeHead(500).end(error.message)
  }
})
server.listen(port, '127.0.0.1', () =>
  console.log(`Local preview: http://127.0.0.1:${port} (home: ${home})`),
)
async function stop() {
  server.close()
  await service.stop()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
