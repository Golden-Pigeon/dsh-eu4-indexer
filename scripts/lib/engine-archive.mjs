import { spawnSync } from 'node:child_process'

/** Keep filesystem ownership and macOS metadata out of distributed archives. */
export function archiveEngine(out, artifact, windows) {
  if (windows) {
    return process.platform === 'win32'
      ? spawnSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            `Compress-Archive -Path bin -DestinationPath '${artifact.replaceAll("'", "''")}' -Force`,
          ],
          { cwd: out, stdio: 'inherit' },
        )
      : spawnSync('zip', ['-Xqr', artifact, 'bin'], {
          cwd: out,
          stdio: 'inherit',
        })
  }
  return spawnSync(
    'tar',
    [
      '-czf',
      artifact,
      '--format',
      'ustar',
      '--owner',
      '0',
      '--group',
      '0',
      '--numeric-owner',
      '--no-xattrs',
      '--no-acls',
      ...(process.platform === 'darwin' ? ['--no-mac-metadata'] : []),
      '-C',
      out,
      'bin',
    ],
    { stdio: 'inherit', env: { ...process.env, COPYFILE_DISABLE: '1' } },
  )
}
