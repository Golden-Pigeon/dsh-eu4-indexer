# Validation & Compatibility

This page records executed code validation as of **2026-11-10**. Earlier findings,
fixes and test counts remain in the [review history](reviews/2026-11-08.md).
Reproduction evidence is local to `artifacts/` and is not shipped in npm packages.
See [test commands](../CONTRIBUTING.md#tests) to reproduce the checks.

## Upstream-aligned engine versions

Upstream [v0.4.0](https://github.com/Golden-Pigeon/eu4-indexer/releases/tag/v0.4.0)
is published from `b71fa0cfe3e004b3c359768360064aff1f2ee4fc` after
[PR #12](https://github.com/Golden-Pigeon/eu4-indexer/pull/12) and the merged main
branch passed Linux, macOS and Windows CI. All six release archives contain the
complete self-contained engine, pinned rules, skills and license notices.
GitHub's server-computed SHA-256 digests match all six verified local archives.
The Windows smoke test also now closes its Python SQLite connections explicitly.

The local plugin remains `0.1.1`; all eight platform npm packages use the upstream
version `0.4.0`. The engine lock pins that release tag and commit. Build checks
compare its version with upstream `AppInfo.fs`; dependency generation, archive
verification, release receipts and staging handle the two versions independently.
CI fetches upstream tags explicitly so shallow checkouts can verify provenance.
These results were recorded before the plugin push and npm staging. See the
[GitHub release](https://github.com/Golden-Pigeon/dsh-eu4-indexer/releases/tag/v0.1.1)
for the release source, verified artifacts and npm approval status.

Validation for this version alignment:

- All 117 local checks passed without skips, including strict TypeScript, mixed
  plugin/engine release receipts, historical dependency resolution and the real
  npm 11.21.2 staging endpoint against a loopback fixture. No real npm credential
  or staging endpoint was used.
- All eight platform engines were rebuilt from neutral tracked-source staging;
  their complete publish trees, licenses and the nine-package release set passed
  verification. Engine capabilities report `0.4.0` after installation.
- Original DSH v0.2.2-rc.1 passed all six installed-package integrations. The
  installed desktop runtime passed five source integrations, with the package-only
  case skipped. Its daily profile and UI were untouched. Isolated rc.1 Web loaded
  the exact packed client with both games' rules ready and zero browser errors.
- Real npm and pnpm fresh installations and upgrades from `0.1.0` passed on macOS
  ARM64, Debian 12 glibc x64 and Alpine musl x64. Each downloaded only its matching
  binary and retained existing data. Both Linux containers also passed type
  checks, 116 portable regressions with the optional staging fixture skipped,
  real-engine integrations and all six original rc.1 packaged integrations.

The npm payloads for Windows, macOS x64 and Linux ARM64 were cross-built and
inspected; they were not executed natively in this local plugin validation.
Upstream CI executed its own Windows x64, macOS ARM64 and Linux x64 flows.
Original `0.1.0` archives and their release receipt retain their original hashes.
Evidence is in local `artifacts/version-align-*.log` and `artifacts/upstream-040-*`.

## On-demand chat tools

The local candidate keeps one unconditional `eu4_indexer_tools` loader. Original
rc.1 per-step tool resolution admits the 16 management tools only after that
Agent enables them. MCP clients start on demand; restored Agent objects, even
with a reused chat ID, start unloaded. Unloading retains jobs and saved defaults.

Validation for this change:

- Strict TypeScript and local regressions: 110 passed, one optional npm-staging
  fixture skipped. Coverage includes cancellation after late MCP startup,
  query draining, idempotent loading, stale Agents and all four skill bodies.
- Original rc.1 installed-package integration: four passed. Resolved model tool
  sets contain only the loader before activation, 34 plugin tools after loading
  a usable index, and only the loader after unloading. A hidden management call
  is rejected by the real execution pipeline. Owner UI bindings work while
  inactive, and other chats retain their own tools and connections.
- The installed Desktop's bundled runtime passed three source integrations,
  with the package-only case skipped. No daily profile or window was changed.
- Isolated original rc.1 Web loaded the exact packed client with an immediately
  ready engine, both rule sets and zero script errors.
- Real npm/pnpm fresh installs and upgrades from 0.1.0 selected only the host
  binary and preserved data. Debian 12 glibc x64 and Alpine musl x64 passed
  type checks, 110 portable tests, real-engine integrations, all four original
  rc.1 packaged integrations and npm/pnpm installation checks.

The tool-set tests resolve actual per-step schemas rather than reading the
unfiltered registration catalog. Natural-language activation/unloading choices
in live model conversations have not been measured. Evidence is in local
`artifacts/ondemand-*.log` and the Web result/screenshot. The existing eight
platform engine packages are reused; this change only updates the plugin.

### Follow-up review

The follow-up reproduced and fixed two lifecycle regressions introduced by
on-demand activation:

- Cancelling a load did not reach its registry request or MCP startup. Both could
  retain the exclusive coordinator until their normal timeout. Activation now
  propagates cancellation, closes a starting client and awaits transport cleanup.
- Shutdown could return during an unload after the binding had been removed but
  before client disposal completed. Shutdown now closes known clients first,
  then drains the coordinator, including the pending unload and query cleanup.

Regressions first failed against the preceding implementation and passed after
the fixes. The full suite now passes 115 tests, with one optional npm-staging
fixture skipped. Added checks cover queued-unload cancellation, retained temporary
selection, registry cancellation, startup cancellation and shutdown ordering.
Original rc.1 installed-package integration passes all six tests, including
owned MCP children which never finish initialization; cancellation and shutdown
both confirm actual child exit. The Desktop's bundled runtime passes five tests,
with the package-only test skipped, without touching its daily profile. Isolated
rc.1 Web reports zero script errors. Real npm/pnpm fresh installations and
0.1.0 upgrades pass on macOS ARM64. Debian 12 glibc x64 and Alpine musl x64
also pass strict type checks, 115 portable regressions, real-engine tests, all
six original rc.1 packaged integrations and npm/pnpm installation checks.
Subsequent source review found no new issues.

Evidence is in `artifacts/ondemand-review-*.log`, including the failing-before-fix
logs and exact packed Web validation. Original 0.1.0 archives and the release
receipt retain their original hashes. Nothing was pushed, staged or published.

## Bundled rules and independent tools

The local candidate now bundles EU4 rules at `a85622d3` and HOI4 rules at
`297dd69c` through nested upstream submodules. Both complete rule trees and
licenses are included in every platform package and its file-hash receipt.
The bundled-rules change is now included in upstream `v0.4.0`; see the release
and version-alignment validation above.
The upstream `setup` command/API and plugin `install_engine`/`setup` operations
are removed. Sixteen independent management tools replace the wrapper tool;
the 17 MCP query tools and chat isolation remain available.

Validation for this change:

- Upstream: 121 tests passed, including bundled-file coverage and rule-origin
  handling. JSONL smoke builds both games without rule downloads, rewrites old
  bundle paths to simulate an upgrade, and refreshes successfully.
- Plugin: 106 tests passed, with one optional npm-staging fixture skipped. Strict
  type checks, tool parameter/session isolation, removed-operation errors,
  UI behavior and all four generated skills passed.
- Original DSH v0.2.2-rc.1: all four packaged integrations passed, including builds
  and refreshes through the independent management tools using npm-installed
  rules. The installed desktop runtime passed three source integrations with
  the package-only case skipped; its daily profile was untouched.
- Isolated original rc.1 Web: exact packed browser code, immediately ready engine
  and both games' rules, no install/download buttons, and zero script errors.
- Real npm/pnpm upgrades from 0.1.0 selected only the host platform, exposed both
  games' rules offline, and preserved user data and ignored legacy engine files.
- Debian 12 glibc x64 and Alpine musl x64: type checks, unit tests, real-engine
  integrations, all four original rc.1 packaged integrations and actual npm/pnpm
  installations passed. The temporary lab containers and input directory were
  removed afterward.
- Eight platform publish trees rebuilt and the complete nine-package release set
  verified. Original 0.1.0 archives and receipt retain their original hashes.

Evidence is in local `artifacts/bundled-rules-*.log` and the Web result/screenshot.

## Unreleased engine-library refactor

The local `0.1.1` candidate uses the public TypeScript `/engine` entry and complete
platform npm publish trees. It has not been pushed, staged or published. Original
`0.1.0` tarballs and their release receipt remain unchanged.

This refactor passed:

- Strict TypeScript checks and the local regression suite, including complete-file
  verification, mismatched provenance, missing dependencies, cancellation,
  external-engine switching and independent management tools.
- Real npm and pnpm installs with lifecycle scripts disabled: only the host
  platform binary was downloaded, and management worked without an engine-install operation.
  Both package managers also upgraded the original `0.1.0` release to the new
  candidate, selected the dependency's new engine and preserved existing data
  and the ignored legacy engine directory. Reproduce with
  `node scripts/verify-package.mjs --upgrade-from=0.1.0` when both releases' local
  tarballs are available.
- All four real-engine integrations against original rc.1 dependencies, including
  the real management tool pipeline, valid JSON on missing-engine errors,
  immediate packaged-engine use, EU4/HOI4 queries and independent chat selections.
  The installed Desktop's bundled runtime also passed the source integrations;
  its daily profile and UI were not modified or restarted.
- Original rc.1 Web installation into isolated directories, with the exact packed
  client bytes, an immediately ready engine, no `home/engine/current` copy and
  zero browser script errors. No engine-install button was clicked.
- Debian 12 glibc x64 and Alpine musl x64 containers on lab: type checks, unit
  regressions, real-engine integrations, all four original rc.1 packaged
  integrations, and npm/pnpm platform selection and immediate offline use.
- All eight native publish-tree builds and the complete nine-package release
  validator, including source/SDK provenance, full file inventories, extra-file
  refusal and complete third-party notices. Outer npm archive metadata was also
  inspected for private ownership, links and accidental local credential files.

macOS ARM64 and both Linux x64 variants were executed for this refactor. Windows,
macOS x64 and Linux ARM64 payloads were cross-built and inspected; this round did
not execute them natively. Existing CI keeps native runners for those platforms.
The earlier results below refer to their original code snapshots, not additional
execution of the new refactor.

Evidence: local `artifacts/engine-library-*.log`, the isolated Web screenshot and
`artifacts/engine-library-web-result.json`. Test containers and their remote
scratch directory are removed after collecting logs.

## DSH v0.2.2-rc.1

The baseline is the official `dsh-v0.2.2-rc.1` tag
(`66491b05e3f05ad35bcdd4f6cd7ed26041d9e3db`) and the installed desktop package
of that version, rather than a development branch carrying the same version
number with later changes.

The actual npm main package passed two real-engine integrations in isolation
against original official dependencies: MCP SDK `2.2.0`, undici `8.11.2` and zod
`4.4.3`, without development overrides. Coverage includes real Connection,
Cordis tool execution, EU4/HOI4 queries, chat isolation, skill registration and
disposal. The desktop package's bundled Node and dependencies also passed these
integrations; this is not end-to-end desktop UI validation.

Real UI validation used the same official CLI, Web frontend and runtime, with
separate `DSH_HOME`, `DSH_AGENTS_HOME`, plugin `home` and pnpm store. Executed
checks include managed-engine installation, rule downloads, synthetic-game
indexing, source previews, parse details, chat bindings, in-use removal protection
and plugin disable/re-enable. The latest re-enable check restored the panel and
preserved indexes, with zero browser script errors.

Natural-language skill selection in live multi-turn model conversations has not
been measured. Automated integration covers all four translations, concurrent
loading and session isolation. UI reload tests do not use the daily desktop
instance; see [isolation instructions](../CONTRIBUTING.md#isolated-web-validation).

The installed Desktop's actual `Resources/runtime/cli/bin/dsh` also passed
package-name installation from the public npm registry in isolated `desktop`
profiles. A profile retaining the unpublished `dsh-eu4-indexer@0.1.0` dependency
reproduced the unscoped 404 while adding the scoped name. Removing that dependency
through the CLI cleared its bundle selection; adding the scoped package then
succeeded, as did installation into a clean profile. Only the matching macOS ARM64
engine was installed, and offline activation and management queries passed.
The same migration against the original archives through a loopback registry
also preserved an existing data marker and `cordis.patch.yml`. These checks
disabled peer auto-installation and lifecycle scripts and did not change or boot
the daily Desktop profile. Evidence: `artifacts/scoped-install-diagnosis/`.
See [migration instructions](installation.md#migrating-a-local-unscoped-installation).

## Platform coverage

The six native jobs and complete release-set verification in the
[release `78699f6` run](https://github.com/Golden-Pigeon/dsh-eu4-indexer/actions/runs/42682990327)
all passed. Each platform exercised upstream fixture tests, plugin checks, real-engine
integration, original DSH rc.1 installed-package integration, npm/pnpm platform
selection and offline engine recovery. Linux jobs also passed the corresponding
Alpine musl checks.

| Platform                 | Recorded native result for `78699f6`                                |
| ------------------------ | ------------------------------------------------------------------- |
| macOS ARM64              | Passed the complete platform job                                    |
| macOS x64                | Passed the complete platform job                                    |
| Linux glibc / musl x64   | Passed both libc variants                                           |
| Linux glibc / musl ARM64 | Passed both libc variants                                           |
| Windows x64              | Passed the complete platform job and four malicious-ZIP regressions |
| Windows ARM64            | Passed the complete platform job and four malicious-ZIP regressions |

The workflow uploads uniquely named engine archives and the tested Linux x64 main
package separately, avoiding concurrent writes to same-named main tarballs.
The successful run produced `verified-npm-release` artifact `13703459304` with
all nine original tarballs and their source-bound receipt. Its archive digest,
receipt, full package contents and all nine public npm integrity values were
verified without regenerating hashes or repacking the release.
The [CI review history](reviews/2026-11-10-ci.md) records preceding failures,
corrections and the aggregation investigation.

Local checks pass all 99 portable tests with npm 11.21.2 supplied for the real npm
loopback regression. Four additional malicious-ZIP cases run natively on Windows.
They retain rejection of parent traversal, sibling-prefix escapes, absolute paths
and symbolic links after canonicalizing 8.3 extraction roots. The original rc.1
preload uses a file URL, and the full Cordis/MCP test has a 180-second total budget;
production operation timeouts are unchanged.

Upstream [PR #11](https://github.com/Golden-Pigeon/eu4-indexer/pull/11) and its
[merged-main CI](https://github.com/Golden-Pigeon/eu4-indexer/actions/runs/42666311775)
passed on Linux, macOS and Windows. The engine source pin `50d399a` is reachable
on main through `1000299`, with the same source tree. It closes short-lived MCP
and refresh-input SQLite connections without pooling and clears test pools before
file cleanup; all 118 upstream tests pass. All eight native engines were built
and tested by the platform matrix.

Before the scope migration, post-merge validation passed 63 unit/browser tests on
macOS ARM64 and both x64 Linux libc variants. After moving to `@goldenpigeon`, all
three passed the 94-test suite, original rc.1 installed-package integrations and
npm/pnpm installation, platform selection and offline recovery. Both Linux
variants also passed two real-engine integrations. Isolated original rc.1 Web
loaded the scoped plugin panel and installed its managed engine with zero script
errors; the installed client bytes matched this round's artifact. All nine scoped
tarballs were repacked and passed full release-set receipt validation. Old
unscoped tarballs were moved out of the release directory. Evidence:
`artifacts/npm-scope-*.log` and `artifacts/npm-scope-web-result.json`.

## npm and build validation

- The main-plus-eight-platform release set passed checks of actual files, current
  in-memory TS compilation, platform metadata, pinned source, SDK, archive hashes
  and licenses.
- Real npm/pnpm installs downloaded only the matching engine. Checks cover public
  types coexisting with same-name host types, offline installation, refusal of
  damaged receipts, reinstallation recovery and continued use after removal of
  the optional platform package.
- Original JS and current TSX replayed identical UI interactions. DOM, form state
  and RPC requests matched at 22 checkpoints. Added task, session and service
  regressions also ran against pre-refactor source.
- The last consecutive source review fixed signal-exit handling in check and
  archive subprocesses and added three regressions. Full review after the fix
  found no further issues. Temporary glibc/musl test directories and containers
  were removed and independently confirmed absent.
- Privacy checks found personal F# build paths and local owner/extended-attribute
  archive metadata. Neutral source staging and archive metadata cleanup fixed
  them, with three regressions. All eight engines were rebuilt; internal files
  and archive metadata in all nine npm packages passed reinspection. Retained
  history and third-party content are covered in [privacy review](privacy.md).

Upstream PR #10 passed three-platform smoke tests and was rebase-merged into main.
Additional fixes replaced a retired macOS CI runner and corrected Windows
management-path formatting, with real-engine regressions. That merged source tree
is the baseline for the local SQLite file-lifetime fix above; all eight engines
include both corrections.

Evidence includes `artifacts/upstream-merge/` and `artifacts/privacy-review/`.
Earlier TS source reviews, behavior comparisons and Web screenshots are in
`artifacts/ts-final-review/`, `artifacts/ts-review/` and `artifacts/ts-review2/`.
See the [history](reviews/2026-11-08.md) for chronology.

## npm staging validation

The workflow and scripts passed local actionlint, compilation, type, unit and
browser checks. Regressions cover whole-set initial-publication guards,
placeholder versions, public/staged targets, registry errors, prerelease tags,
old npm versions, changed archives, partial failures and receipt completeness.
Actual npm packlists exclude `.secret/` and token files; tests do not read tokens.

Credential review removed project dependency installation and builds from the
staging job. Release receipts bind the workflow commit, nine archive hashes and
exact dependencies. Full-script regressions run without `node_modules` or `dist`.
They cover explicit staging opt-in, zero uploads when the last package lacks an
initial publication, incomplete summaries after partial failure, and isolation
from Node preload, PATH replacement, external npm configuration, unrelated secrets
and token-bearing child-process errors. Credentials must live in the
`npm-staging` environment restricted to the default branch. The remote environment
is configured with one Branch rule for `main`, no Tag rules, and the
maintainer-provided stage-only token stored as environment secret `NPM_STAGE_TOKEN`.
The environment and secret metadata were read back; no repository-level copy of
the secret was created. See [publishing setup](publishing.md#staging-credentials).

Real npm **11.21.2** ran against a temporary loopback registry with fake tokens.
It wrote only to staging endpoints, uploaded identical tarball bytes and skipped
lifecycle scripts. No live npm staging or approval has been executed. Initial
publication of all nine real versions was performed personally by the maintainer.

Further regressions reject malicious tarballs even with self-consistent hashes:
embedded `publishConfig`, changed identity or other manifest fields, private
packages, duplicate or hard-linked manifests and corrupt archives. The full entry
point refuses these before starting any npm subprocess. Receipt creation rejects
archives replaced after validation instead of recording new hashes. Final artifact
handoff uses the validation job's output artifact ID. Static workflow checks and
the real GitHub artifact handoff passed for release `78699f6`.

That CI review passed 92 local tests; Node 24 glibc and musl containers each passed
29 staging tests, including loopback uploads with the real pinned npm CLI. All
nine actual packages passed manifest, content and receipt validation; actionlint
passed. Full review after fixes found no further issues. Temporary directories
and containers were cleaned and independently checked. Evidence is in
`artifacts/ci-review3-*.log`. The subsequent scope-migration run is recorded above.

## Publication status

The maintainer published the main package and all eight platform packages as
`0.1.0`. Every public integrity value matches the original CI receipt for
`78699f665a4a0de8bee51817c780e7a28965e841`.
Fresh npm and pnpm installations from the official registry on macOS ARM64 each
installed only the matching engine and passed offline managed-engine activation
and a management query. These checks used no npm credentials; their temporary
directories were removed. Other platforms retain the native CI coverage above.

The public [GitHub repository](https://github.com/Golden-Pigeon/dsh-eu4-indexer)
contains the release source. Published archives and their original receipt are
preserved unchanged; later documentation updates do not replace those bytes.
GitHub writes follow the maintainer's current authorization, which can cover
necessary pushes and PR merges within an agreed open-source plan.

Upstream privacy-history cleanup was previously pushed with authorization and
two branches plus six tags were verified. Uncommitted work in the separate
upstream checkout was preserved. The earlier management, session, HOI4, SQLite
security and Windows path fixes are on main; see
[PR #10](https://github.com/Golden-Pigeon/eu4-indexer/pull/10). Read-only PR refs
and GitHub caches are covered in
[history and third-party content](privacy.md#history-and-third-party-content).

Development dependency audits do not establish that all user-host dependencies
are free of advisories. rc.1 compatibility requires no host SDK upgrade. See
[licenses and audit boundaries](packaging.md#third-party-licenses-and-dependency-audits).
