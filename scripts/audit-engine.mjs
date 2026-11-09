import { spawnSync } from 'node:child_process'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const run = spawnSync(
  'dotnet',
  [
    'list',
    'external/eu4-indexer/Eu4Indexer.Cli/Eu4Indexer.Cli.fsproj',
    'package',
    '--vulnerable',
    '--include-transitive',
    '--format',
    'json',
  ],
  {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: 120000,
  },
)
if (run.error) throw run.error
if (run.status !== 0)
  throw new Error(run.stderr || run.stdout || 'NuGet audit failed')
const report = JSON.parse(run.stdout)
if (
  report.version !== 1 ||
  !report.sources?.length ||
  !report.projects?.length ||
  report.problems?.length
)
  throw new Error('NuGet audit did not return a complete successful report')
const vulnerable = report.projects.flatMap((project) =>
  (project.frameworks ?? []).flatMap((framework) =>
    [
      ...(framework.topLevelPackages ?? []),
      ...(framework.transitivePackages ?? []),
    ].filter((pkg) => pkg.vulnerabilities?.length),
  ),
)
if (vulnerable.length)
  throw new Error(
    'Vulnerable engine dependencies: ' +
      vulnerable
        .map(
          (pkg) =>
            `${pkg.id}@${pkg.resolvedVersion}: ${pkg.vulnerabilities.map((v) => v.advisoryurl).join(', ')}`,
        )
        .join('; '),
  )
console.log(
  'NuGet audit: no known vulnerable direct or transitive engine packages.',
)
