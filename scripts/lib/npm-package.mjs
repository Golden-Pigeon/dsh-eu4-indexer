/** npm pack flattens a scoped name into one archive filename. */
export function npmArchiveName(name, version) {
  return `${name.replace(/^@/, '').replace('/', '-')}-${version}.tgz`
}
