import test from 'node:test'
import assert from 'node:assert/strict'
import { releaseTag, releaseNotes } from '../scripts/lib/release.mjs'

test('only version-matching tag push events select a release dist tag', () => {
  const env = {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'push',
    GITHUB_REF: 'refs/tags/v0.1.2',
  }
  assert.equal(releaseTag('0.1.2', env), 'latest')
  assert.equal(
    releaseTag('0.1.2-rc.1', { ...env, GITHUB_REF: 'refs/tags/v0.1.2-rc.1' }),
    'next',
  )
  for (const change of [
    { GITHUB_ACTIONS: 'false' },
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_EVENT_NAME: 'workflow_dispatch' },
    { GITHUB_REF: 'refs/heads/main' },
    { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_REF: 'refs/tags/v0.1.1' },
  ])
    assert.throws(
      () => releaseTag('0.1.2', { ...env, ...change }),
      /tag push matching/,
    )
  assert.throws(() => releaseTag('', env), /tag push matching/)
})

test('release notes select only the requested version and reject missing or empty entries', () => {
  const source =
    '# Changelog\n\n## Unreleased\n\n- Later work.\n\n## 0.1.2 — 2026-11-10\n\n- Released work.\n\n### Detail\n\nKept detail.\n\n## 0.1.1\n\n- Old work.\n'
  const expected = '- Released work.\n\n### Detail\n\nKept detail.'
  assert.equal(releaseNotes(source, '0.1.2'), expected)
  assert.equal(releaseNotes(source.replaceAll('\n', '\r\n'), '0.1.2'), expected)
  assert.equal(releaseNotes(source, '0.1.1'), '- Old work.')
  assert.throws(() => releaseNotes(source, '0.1.20'), /Missing changelog/)
  assert.throws(
    () => releaseNotes('## 0.1.2\n\n## 0.1.1\n', '0.1.2'),
    /Empty changelog/,
  )
})
