import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import os from 'node:os'
import { Engine, rid } from '../dist/engine/runtime.js'

for (const fixture of [
  {
    name: 'parent traversal',
    entry: '..\\outside',
    error: /Unsafe archive path/,
  },
  {
    name: 'sibling-prefix escape',
    entry: '../extracted-sibling/outside',
    error: /Unsafe archive path/,
  },
  { name: 'absolute path', absolute: true, error: /Unsafe archive path/ },
  {
    name: 'symbolic link',
    entry: 'bin/link',
    link: true,
    error: /Archive links are not allowed/,
  },
])
  test(
    `Windows engine ZIP rejects ${fixture.name} before extraction`,
    { skip: process.platform !== 'win32', timeout: 30000 },
    async () => {
      const home = await mkdtemp(path.join(os.tmpdir(), 'dsh zip-guard-'))
      try {
        const file = path.join(home, 'malicious.zip')
        const script =
          '$ErrorActionPreference="Stop"; Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::Open($env:ZIP_FILE,[IO.Compression.ZipArchiveMode]::Create); try { $e=$z.CreateEntry($env:ZIP_ENTRY); if($env:ZIP_LINK -eq "true") { $e.ExternalAttributes=-1610612736 }; $w=New-Object IO.StreamWriter($e.Open()); try { $w.Write("fixture-only") } finally { $w.Dispose() } } finally { $z.Dispose() }'
        execFileSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-EncodedCommand',
            Buffer.from(script, 'utf16le').toString('base64'),
          ],
          {
            timeout: 15000,
            env: {
              ...process.env,
              ZIP_FILE: file,
              ZIP_ENTRY: fixture.absolute
                ? path.join(home, 'outside')
                : fixture.entry,
              ZIP_LINK: String(Boolean(fixture.link)),
            },
          },
        )
        const archive = await readFile(file)
        const engine = new Engine({
          home,
          manifest: {
            apiVersion: 1,
            sourceCommit: 'zip-guard-fixture',
            assets: {
              [rid()]: {
                url: 'https://example.invalid/engine.zip',
                sha256: createHash('sha256').update(archive).digest('hex'),
              },
            },
          },
          fetchImpl: async () => new Response(archive),
        })
        await assert.rejects(engine.install(), fixture.error)
        await assert.rejects(readFile(path.join(home, 'outside')), {
          code: 'ENOENT',
        })
      } finally {
        await rm(home, { recursive: true, force: true })
      }
    },
  )
