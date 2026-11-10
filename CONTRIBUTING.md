# Contributing to DSH EU4 Indexer

This guide covers setup, conventions, builds and validation. For user operations,
see the [usage guide](docs/usage.md); for module boundaries, see
[architecture](docs/architecture.md). Platform artifacts and release checks are
covered in [packaging](docs/packaging.md).

## Getting set up

- Node.js **24.15+ in the 24.x line, or 26+** for development and UI tests
  (jsdom 31). The plugin's runtime requirement remains Node.js 24+.
- .NET SDK **9.0.315**, pinned by `global.json`, to build and test the engine.
- Git and pnpm 11 for package-installation checks; the validated pnpm version is
  `11.21.0`.

Initialize the submodules recursively, install development dependencies, then
build and check:

```sh
git submodule update --init --recursive
npm ci --ignore-scripts --omit=optional
npm run build
npm run check
```

Source development builds engines separately, so omitting optional dependencies
avoids downloading packaged platform binaries. `engine.lock.json` records the exact upstream
source commit. Before sharing a new pin, ensure it is available remotely with its
nested submodules. Upstream [PR #10](https://github.com/Golden-Pigeon/eu4-indexer/pull/10)
merged the management, session isolation, HOI4 rules and SQLite security fixes into
main. See [validation](docs/validation.md) for current source availability,
publication status and coverage history.

## Conventions

Production source uses strict TypeScript; React UI code uses TSX.
`src/contracts.ts` holds shared protocol and state types, and `src/client/host.ts`
describes the rc.1 browser host contract. Node build scripts and tests against
compiled output remain `.mjs`.

`npm run build` type-checks and compiles in memory before replacing the JavaScript,
declarations and source maps in `dist/`. Type errors preserve the last runnable
output. Do not edit `dist/`, `resources/skills/` or `resources/docs/` by hand:
skills and upstream reference documents are generated from the pinned submodule.
Change their source or the generator instead.

Keep the README, contributor guide and reference documentation in English, as in
the upstream repository. Keep the README focused on an overview and entry points;
put detailed instructions in `docs/`. Preserve both English and Chinese game
skills and UI translations.

**DSH v0.2.2-rc.1 is the compatibility baseline.** The browser entry uses its
`window.__ModuleLoader__`, with React supplied by the host. Preserve existing
management and MCP behavior. General parsing, database and game-query changes
belong upstream; DSH lifecycle and UI changes belong here.

## Tests

| Command                             | Scope and prerequisites                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                 | Source and compile-time type contracts; no existing `dist/` required                                  |
| `npm run check`                     | Build, strict checks, script syntax, skill generation, all unit and browser-interaction tests         |
| `npm run test:upstream`             | Upstream .NET tests                                                                                   |
| `npm run test:integration`          | Real engine management and official Cordis/MCP integration; requires the engine and both games' rules |
| `npm run test:dsh-rc1`              | Install original official rc.1 dependencies temporarily and run real integrations                     |
| `npm run test:dsh-rc1 -- --package` | rc.1 integration against the installed npm main and platform packages                                 |
| `npm run test:desktop`              | The same integration using the installed desktop application's Node and dependencies                  |
| `npm run verify:package`            | Real npm/pnpm installation, platform selection, public types and immediate offline use                |
| `npm run verify:release`            | Consistency of the complete main-plus-eight-platform release set                                      |

### Engine and rules

Build upstream with both games' bundled CWTools rules:

```sh
dotnet build external/eu4-indexer/Eu4Indexer.slnx
npm run test:integration
npm run test:dsh-rc1
```

Rules are copied from pinned submodules into engine build/publish output.
Set `EU4_CONFIG_DIR` and
`HOI4_CONFIG_DIR` to use separate directories. Set `DSH_EU4_ENGINE` to select a
self-contained engine; otherwise integration tests use upstream Debug output.
Fixtures use synthetic games and do not distribute real game or mod data.

`test:dsh-rc1` does not inherit root overrides and asserts that the official
release uses MCP SDK `2.2.0`. SDK, undici and zod overrides in development
dependencies provide additional regression coverage; they are not host
installation requirements. See [builds and checks](docs/packaging.md#builds-and-checks)
for the artifact-validation sequence.

Set `DSH_TEST_PLUGIN_ARCHIVE` with `--package` to test a candidate main tarball
from another directory while preserving an existing release set. Platform packages
still come from `artifacts/npm/`. This mode also verifies the real management tool
pipeline with an immediately ready engine and both games' rules, independent
management tools and missing-external-engine errors.

`test:desktop` defaults to `/Applications/DeepSeek Harness.app`; override it with
`DSH_DESKTOP_APP`. Other platforms can set `DSH_DESKTOP_NODE` and
`DSH_DESKTOP_RUNTIME` separately. It runs integration tests in temporary data
directories without changing application files or existing profiles. It does not
validate the desktop UI.

### Local UI preview

```sh
npm run preview
```

The preview listens only on `127.0.0.1:3219` and stores data in the system temporary
directory by default. Overrides: `DSH_EU4_PREVIEW_HOME`, `DSH_EU4_PREVIEW_PORT` and
`DSH_EU4_ENGINE`. It uses a simplified host. The production plugin serves its UI
through DSH's authenticated connection and does not start this HTTP service.

## Isolated Web validation

Use the official rc.1 Web client for real integration checks. Set separate
`DSH_HOME` and `DSH_AGENTS_HOME` **before any CLI invocation**, including
`web --help` and `--dump-config`: those commands also initialize profiles.

In the test profile's `cordis.patch.yml`, give the plugin a separate `home` and
use the same pnpm `storeDir` for the CLI and Web plugin manager. `DSH_HOME` alone
does not isolate plugin data. See [local installation](docs/packaging.md#local-installation)
for installing the artifacts.

When retesting an unpublished tarball with the same version, use an isolated
cache and compare the installed browser file with current compiled output. Check
immediate engine and bundled-rule readiness, indexing, chat binding, in-use removal
protection and plugin disable/re-enable behavior. Record browser errors and the
scope tested. Close the test instance and remove its temporary directories when
finished; leave the daily desktop instance and global pnpm store alone.

Engine builds use a temporary source copy outside the developer's home and remove
it afterwards. If `/tmp` or Windows Public Documents is not writable, set
`DSH_EU4_BUILD_TEMP` to a writable neutral location. Keep release builds out of
personal source paths. See [privacy review](docs/privacy.md) for build-path and
archive-metadata checks.

## Updating upstream

1. Update `external/eu4-indexer` and required nested submodules. Implement and
   test general functionality upstream, then commit those changes locally.
2. Publish an upstream release, then set `engine.lock.json`'s `sourceCommit`,
   `sourceTag` and `engineVersion` to that release. Platform package versions
   match the upstream engine; the plugin has its own version. Engine builds and skill
   generation require a clean upstream worktree matching the lock.
   Fetch upstream tags with `git -C external/eu4-indexer fetch origin --tags`
   if the checkout is shallow or predates the release. CI fetches these tags
   explicitly before source validation.
3. Run `npm run prepare:engines` to synchronize versions and platform dependencies,
   then `npm run build` to generate skills and reference docs. Rebuild affected
   native engines.
4. Run upstream, plugin, original rc.1 and installed-package regressions. Validate
   the full release set as described in [packaging](docs/packaging.md) and update
   the changelog.

Do not update only the executable or edit generated skills and documentation
directly. Preserve upstream functionality; reusable management APIs and new
game-rule support belong upstream.

## Commits and contributions

Keep each change focused on one concrete problem. Describe the resulting behavior,
validation and actual coverage. Changes to the npm file set or documentation
entry points also need checks against the installed package. Keep upstream
commits and this repository's submodule pointer clearly aligned. See the
[release sequence](docs/packaging.md#release-sequence) for publishing and remote
operations.

Contributions are licensed under the project's [MIT License](LICENSE).
