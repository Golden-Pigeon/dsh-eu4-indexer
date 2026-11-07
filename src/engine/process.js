import { spawn } from 'node:child_process'
import { cleanEnv, UserError } from '../util.js'

/** Run one management request. Only complete JSONL records reach the caller. */
export function manage(
  executable,
  home,
  request,
  { signal, onEvent = () => {}, timeoutMs = 0 } = {},
) {
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ['manage'], {
      env: cleanEnv({ EU4INDEXER_HOME: home }),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let pending = '',
      stderr = '',
      terminal,
      protocolError,
      timer,
      killTimer
    const stop = () => {
      child.kill('SIGTERM')
      killTimer ??= setTimeout(() => child.kill('SIGKILL'), 3000).unref()
    }
    const abort = () => stop()
    signal?.addEventListener('abort', abort, { once: true })
    if (timeoutMs)
      timer = setTimeout(() => {
        protocolError = new UserError('Engine operation timed out', 'timeout')
        stop()
      }, timeoutMs).unref()
    const consume = (line) => {
      if (!line.trim()) return
      const event = JSON.parse(line)
      if (
        event.apiVersion !== 1 ||
        !['log', 'progress', 'result', 'error'].includes(event.type)
      )
        throw new Error('Unsupported management protocol')
      if (terminal)
        throw new Error('Engine emitted data after its terminal response')
      if (event.type === 'result' || event.type === 'error') terminal = event
      onEvent(event)
    }
    child.stdout.setEncoding('utf8').on('data', (text) => {
      try {
        pending += text
        if (Buffer.byteLength(pending) > 16 * 1024 * 1024)
          throw new Error('Engine response exceeds 16 MiB')
        let end
        while ((end = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, end)
          pending = pending.slice(end + 1)
          consume(line)
        }
      } catch (error) {
        protocolError = error
        stop()
      }
    })
    child.stderr.setEncoding('utf8').on('data', (text) => {
      stderr = (stderr + text).slice(-131072)
    })
    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') protocolError = error
    })
    child.on('error', (error) => {
      protocolError = error
    })
    child.on('close', (code, exitSignal) => {
      clearTimeout(timer)
      clearTimeout(killTimer)
      signal?.removeEventListener('abort', abort)
      try {
        if (signal?.aborted && !(terminal?.type === 'result' && code === 0))
          throw signal.reason ?? new DOMException('Cancelled', 'AbortError')
        if (protocolError) throw protocolError
        if (pending.trim()) consume(pending)
        if (terminal?.type === 'error')
          throw new UserError(terminal.data.message, terminal.data.code)
        if (code !== 0 || terminal?.type !== 'result')
          throw new UserError(
            stderr || `Engine exited (${code ?? exitSignal}) without a result`,
            'engine_failed',
          )
        resolve(terminal.data)
      } catch (error) {
        reject(error)
      }
    })
    child.stdin.end(JSON.stringify(request))
  })
}
