interface Admission {
  write: boolean
  resolve: () => void
  reject: (reason: unknown) => void
  signal?: AbortSignal
  abort: () => void
}
/** Concurrent reads, exclusive selection/registry changes, with cancellable FIFO admission. */
export class SelectionGate {
  readers = 0
  writing = false
  queue: Admission[] = []
  async run<T>(
    write: boolean,
    work: () => T | Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    signal?.throwIfAborted()
    await new Promise<void>((resolve, reject) => {
      const entry: Admission = {
        write,
        resolve,
        reject,
        signal,
        abort: () => {
          const at = this.queue.indexOf(entry)
          if (at < 0) return
          this.queue.splice(at, 1)
          reject(signal?.reason)
          this.pump()
        },
      }
      signal?.addEventListener('abort', entry.abort, { once: true })
      this.queue.push(entry)
      this.pump()
    })
    try {
      signal?.throwIfAborted()
      return await work()
    } finally {
      if (write) this.writing = false
      else this.readers--
      this.pump()
    }
  }
  pump() {
    while (!this.writing && this.queue.length) {
      const entry = this.queue[0]
      if (entry.write && this.readers) return
      this.queue.shift()
      entry.signal?.removeEventListener('abort', entry.abort)
      if (entry.write) this.writing = true
      else this.readers++
      entry.resolve()
    }
  }
}
