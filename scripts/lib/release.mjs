/** Only a version-matching tag push is a release; ordinary CI never receives npm credentials. */
export function releaseTag(version, env = process.env) {
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/.test(
      version ?? '',
    ) ||
    env.GITHUB_ACTIONS !== 'true' ||
    env.GITHUB_EVENT_NAME !== 'push' ||
    env.GITHUB_REF !== `refs/tags/v${version}`
  )
    throw new Error('Release requires a tag push matching the package version')
  return version.includes('-') ? 'next' : 'latest'
}

export function releaseNotes(changelog, version) {
  const lines = changelog.split(/\r?\n/)
  const start = lines.findIndex(
    (line) => line === `## ${version}` || line.startsWith(`## ${version} — `),
  )
  if (start < 0) throw new Error(`Missing changelog entry for ${version}`)
  const end = lines.findIndex(
    (line, index) => index > start && line.startsWith('## '),
  )
  const notes = lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim()
  if (!notes) throw new Error(`Empty changelog entry for ${version}`)
  return notes
}
