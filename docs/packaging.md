# npm Platform Packages & Local Validation

The main package, `@goldenpigeon/dsh-eu4-indexer`, contains the plugin, UI, skills
and documentation. Exact-version `optionalDependencies` reference eight engine
packages in the same scope:

| .NET RID                          | npm package suffix                | Platform restriction         |
| --------------------------------- | --------------------------------- | ---------------------------- |
| osx-x64 / osx-arm64               | darwin-x64 / darwin-arm64         | darwin + matching CPU        |
| win-x64 / win-arm64               | win32-x64 / win32-arm64           | win32 + matching CPU         |
| linux-x64 / linux-arm64           | linux-x64 / linux-arm64           | linux + matching CPU + glibc |
| linux-musl-x64 / linux-musl-arm64 | linux-musl-x64 / linux-musl-arm64 | linux + matching CPU + musl  |

Full engine names are `@goldenpigeon/dsh-eu4-indexer-engine-<suffix>`. npm and pnpm
download only the binary matching the host Node platform by default. Resolving
another platform's metadata does not download its binary. Explicit cross-platform
configuration can install more than one. Disabling optional dependencies skips
the engine; the plugin reports an actionable error.

`npm pack` flattens scoped names into filenames: for example,
`goldenpigeon-dsh-eu4-indexer-0.1.0.tgz`. Release receipts and validators use this
convention; installation still uses
`node_modules/@goldenpigeon/dsh-eu4-indexer`.

## Builds and checks

Follow [setup](../CONTRIBUTING.md#getting-set-up) to install dependencies,
initialize recursive submodules and prepare the pinned .NET SDK and pnpm. The
contributor guide covers ordinary builds, type checks and real-engine tests;
this section covers platform artifacts.

Both the main entry and `./client` point into `dist/`. Packages ship JavaScript,
declarations and source maps with embedded source, without a runtime compiler
dependency. README, the contributor guide and `docs/` ship together so relative
links work inside the package. See [code layout](architecture.md#code-layout) for
generation details.

```sh
npm run audit:engine
npm run prepare:engines
npm run build:engine -- --all
npm run pack:engines -- --all
npm pack --pack-destination artifacts/npm
npm run verify:release
# After preparing a real engine and both games' rules:
npm run test:dsh-rc1 -- --package
npm run verify:package
```

`prepare:engines` synchronizes all eight package versions, platform declarations
and main-package dependencies. After a submodule update, also set
`engine.lock.json`'s `sourceCommit` to the pinned commit. Builds require a clean
submodule at that commit. Each RID's output is cleared before generating its
self-contained engine, third-party notices, archive and `engine.json`. Hashes and
source identities are never reused from another RID. `global.json` and CI pin
the same SDK, checked against `engine.lock.json` before building. Platform receipts
record it; packing, release validation and installation reject old builds with
mismatched provenance. FSharp.Core is `9.0.303`, as resolved by that SDK, and the
license inventory matches the artifacts.

For host-only validation, omit `-- --all` from the two commands that use it. Main
package packing does not require platform binaries, but skill and documentation
generation checks the upstream commit and worktree against the engine lock.
Platform-package prepack rejects missing, damaged or stale artifacts.
`verify:release` requires all eight platform packages and checks platform
metadata, archive hashes, pinned source, licenses, and the actual main package's
engine lock, DSH metadata, entries and dependencies.

Release checks also compare every code, skill, locale, license and documentation
file declared by the main package's `files` whitelist, rejecting extra files.
Expected `dist/` bytes come from compiling current TypeScript in memory without
changing the worktree; stale local output cannot serve as the reference. LF line
endings keep output consistent across systems. Correct version numbers and locks
alone are insufficient: source changes require repacking.

`verify:package` serves real tarballs through a temporary read-only, loopback-only
registry, then installs them with npm and pnpm in clean directories. It records
binary requests and requires only the matching platform download. With lifecycle
scripts disabled, it checks offline installation, verification, probing and
first-time managed installation after clearing an external path. No packages are
uploaded or published. Host peer auto-installation is disabled for this check;
real Cordis/MCP integrations validate the official DSH peers.

Managed-engine receipts bind source, API, SDK, RID and platform package version.
Missing or mismatched receipts after an upgrade return `engine_update_required`;
**Install / update managed engine** restores the installation and preserves
databases. Installation tests damage each field, verify refusal and recovery, and
confirm a matching installed engine still works after its optional package is
removed.

Engines compile from Git-tracked source staged outside personal home directories,
preventing F# assemblies from embedding personal source paths. Receipt
`sourcePathPolicy` is checked during installation and release validation. Tar
archives clear owner names, set UID/GID to zero and disable extended attributes;
ZIP archives created on Unix omit owner extension fields. Set
`DSH_EU4_BUILD_TEMP` to select a neutral staging directory. See
[privacy review](privacy.md) for scope and retained historical content.

## Local installation

The main package depends on same-version platform packages and does
not contain binaries itself. Its tarball alone is not a complete offline bundle.
Pack it and the target platform package as above, then start the read-only local
registry:

```sh
npm run registry:local
```

Prepare an [isolated Web environment](../CONTRIBUTING.md#isolated-web-validation),
then install from another terminal:

```sh
dsh plugin --profile web add @goldenpigeon/dsh-eu4-indexer --registry http://127.0.0.1:4873
```

The DSH plugin manager can use the same registry. It reads `artifacts/npm/`,
redirects other package queries to the official npm registry, and has no publish
endpoint. Stop it when finished. Override the port with `DSH_EU4_REGISTRY_PORT`.

## Linux native dependencies

Self-contained .NET deployment includes the runtime, but does not statically link
all native libraries. glibc and musl builds are separate. Linux still needs .NET's
native dependencies, including OpenSSL, ICU and libstdc++, and must meet the
corresponding .NET version's distribution requirements.

Debian 12 tests use `libicu72 libssl3 libgssapi-krb5-2 ca-certificates`. Alpine uses
`icu-libs icu-data-full libgcc libstdc++ libssl3 zlib ca-certificates krb5`. Other
distributions need equivalent packages and versions from their own package
manager. Globalization-invariant mode is not enabled, preserving language,
regional and comparison behavior.

References: [.NET self-contained deployment](https://learn.microsoft.com/en-us/dotnet/core/deploying/#publish-as-self-contained)
and [Alpine dependencies](https://learn.microsoft.com/en-us/dotnet/core/install/linux-alpine#dependencies).

## Third-party licenses and dependency audits

Builds enumerate dependencies from NuGet assets and collect pinned full license
snapshots, package notices, copyright and author information. They also retain
full CWTools, eu4-indexer and .NET runtime licenses and third-party notices.
Unregistered dependencies or snapshot-hash mismatches fail the build. Inventories
and full texts are included in both platform npm packages and internal engine
archives, and remain after installation. `resources/third-party/sources.json`
records snapshot sources and hashes.

`npm run audit:engine` checks direct and transitive NuGet dependencies. Advisories
or an incomplete report fail the check; CI runs it after upstream tests.
SQLitePCLRaw's compatible bundle is pinned to `2.1.14` to avoid CVE-2025-6965 in
older native SQLite. Real-engine tests also check a minimum native SQLite version
and FTS5 functionality.

Root overrides apply only to development dependency regressions. They are not
plugin installation requirements and do not propagate into users' DSH profiles.
A clean development-lock audit does not establish that a user's host is free of
advisories.

Compatibility is based on **DSH v0.2.2-rc.1 with original dependencies**. It does
not require a host upgrade, replacement SDK or profile overrides. Native CI and
musl containers are configured to test actual npm artifacts against original
rc.1; development overrides provide additional regression coverage. See
[test commands](../CONTRIBUTING.md#tests) and [executed coverage](validation.md).

Host dependency advisories are recorded separately from functional rc.1
compatibility. The plugin uses MCP stdio transport and does not enable the SDK's
HTTP client or redirect features. Passing compatibility tests does not establish
that every host dependency is free of security advisories.

## Release sequence

The maintainer personally publishes all nine packages for the first time. Later
versions can only be staged by CI; the maintainer then completes npm 2FA approval,
first for all eight platform packages and then the main package. Ordinary pushes
and pull requests build and test only; they never trigger staging.

See [publishing](publishing.md) for version preparation, manual triggers,
credentials and recovery. Prepare and rebuild artifacts for each version change.
An already published package version cannot be replaced.
