import { UserError } from '../util.js'

/** npm platform names and .NET runtime identifiers are deliberately kept together. */
export interface Platform {
  name: string
  os: string[]
  cpu: string[]
  libc?: string[]
}
const osNames: Record<string, string> = { darwin: 'osx', win32: 'win' }
export const platforms: Record<string, Platform> = Object.fromEntries(
  ['darwin', 'win32', 'linux', 'linux-musl'].flatMap((platform) =>
    ['x64', 'arm64'].map((cpu) => {
      const os = platform === 'linux-musl' ? 'linux' : platform
      const target = `${osNames[platform] ?? platform}-${cpu}`
      return [
        target,
        {
          name: `@goldenpigeon/dsh-eu4-indexer-engine-${platform}-${cpu}`,
          os: [os],
          cpu: [cpu],
          ...(os === 'linux'
            ? { libc: [platform === 'linux-musl' ? 'musl' : 'glibc'] }
            : {}),
        },
      ]
    }),
  ),
)

export function rid(
  platform: string = process.platform,
  arch: string = process.arch,
  libc?: string,
) {
  if (platform === 'linux') {
    libc ??= (
      process.report.getReport() as { header: { glibcVersionRuntime?: string } }
    ).header.glibcVersionRuntime
      ? 'glibc'
      : 'musl'
    if (!['glibc', 'musl'].includes(libc))
      throw new UserError(`Unsupported libc: ${libc}`, 'unsupported_platform')
  }
  const target = `${platform === 'linux' ? (libc === 'musl' ? 'linux-musl' : 'linux') : osNames[platform]}-${arch}`
  if (!platforms[target])
    throw new UserError(
      `Unsupported platform: ${platform}/${arch}`,
      'unsupported_platform',
    )
  return target
}
