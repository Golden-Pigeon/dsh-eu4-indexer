# Validation & Compatibility

This page records executed code validation as of **2026-11-10**. Earlier findings,
fixes and test counts remain in the [review history](reviews/2026-11-08.md).
Reproduction evidence is local to `artifacts/` and is not shipped in npm packages.
See [test commands](../CONTRIBUTING.md#tests) to reproduce the checks.

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

## Platform coverage

The first [GitHub CI run](https://github.com/Golden-Pigeon/dsh-eu4-indexer/actions/runs/42635903548)
tested `497e27c`: four jobs passed, while both Windows jobs failed during upstream
database cleanup. Upstream [PR #11](https://github.com/Golden-Pigeon/eu4-indexer/pull/11)
fixed the connection lifetime and cleanup issues. Its three-platform CI passed
before merge; the [merged main run](https://github.com/Golden-Pigeon/eu4-indexer/actions/runs/42666311775)
also passed on Linux, macOS and Windows.

The [plugin follow-up run](https://github.com/Golden-Pigeon/dsh-eu4-indexer/actions/runs/42665715595)
tested `dade5ef`, pinning upstream `50d399a`. Windows passed all 118 upstream
tests, then exposed tar CRLF parsing and POSIX-only assumptions in plugin tests.
Intel Mac exceeded the Cordis/MCP integration's former 60-second total budget.

The [next run](https://github.com/Golden-Pigeon/dsh-eu4-indexer/actions/runs/42670526836)
tested `9ed6656`. Both Linux jobs and Intel Mac passed. Windows reduced its
failures from 12 to two: complete-set validation still read tar output without
CRLF handling, and libuv restored an omitted PATH from the parent environment.
macOS ARM64 passed its upstream and plugin tests, then failed in F# compilation
with an internal `LexerStore.getStoreData` error. Both repository and neutral
staging already pin SDK 9.0.315; a fresh engine build must revalidate that failure.
Complete-set validation and npm staging were skipped in both runs.

| Platform                 | Latest executed native coverage                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS ARM64              | `dade5ef` passed original rc.1 package integrations and npm/pnpm checks; `9ed6656` passed 118 upstream tests and 98 plugin tests with one optional staging regression skipped, then failed during the staged engine build |
| macOS x64                | `9ed6656` passed upstream and plugin tests, both real-engine and original rc.1 installed-package integrations, and npm/pnpm checks after the test budget correction                                                       |
| Linux glibc / musl x64   | `9ed6656` passed plugin tests, real-engine and original rc.1 package integrations, npm/pnpm platform selection and offline recovery on both libc variants                                                                 |
| Linux glibc / musl ARM64 | The same `9ed6656` glibc and musl checks passed on ARM64                                                                                                                                                                  |
| Windows x64 / ARM64      | `9ed6656` passed all 118 upstream tests; plugin results were 86 passed, two failed and 11 skipped. Packaging and installed rc.1 tests remain pending                                                                      |

Platform jobs omit the pinned staging CLI and skip that optional real npm case;
the complete-set job runs it. Local verification supplies npm 11.21.2 and runs
all 99 portable tests without skips. Four additional malicious-ZIP cases run
natively in Windows jobs.

The source pin `50d399a` closes short-lived MCP and refresh-input SQLite
connections without pooling, clears test pools before file cleanup, and runs
upstream fixture tests on all three platforms. Three regressions failed before
the fix: native pooled handles remained open, and MCP queries and refresh-input
reads returned old data after same-path replacement. All 118 upstream tests pass
locally with pinned rules. All eight engines were rebuilt locally. The pin is
reachable on upstream main through merge commit `1000299`, with the same source
tree. Evidence is in `artifacts/open-source-0.1.0/windows-fix/` and
`artifacts/open-source-0.1.0/remote-follow-up/`.

The latest local correction reuses the checked tar path parser for both main and
engine archives during full release verification. LF/CRLF, unsafe-path,
duplicate-manifest and full Windows manifest-check regressions pass. npm children
receive an explicit empty PATH, preventing libuv's Windows environment fallback;
the isolation regression failed before this change and passes after it. Packaging
fixtures still require failed process exits and prevent later checks after
termination; POSIX signal text is asserted only on POSIX. The stale-TypeScript
guard still requires the deliberate source change to be detected. The real
Cordis/MCP fixture has a 180-second overall budget; production operation timeouts
are unchanged. Its original rc.1 preload is passed as a file URL, because the
Windows installed-package run rejected an absolute drive path before loading
tests. A native minimal ZIP reproduced Windows 8.3 temporary-directory expansion:
entry targets were normalized to long paths while the extraction root stayed
short. Normalizing both paths removes the false rejection. Native regressions
retain rejection of traversal, sibling-prefix escapes, absolute paths and links.
Full native CI and a verified nine-package CI artifact set remain
required before first npm publication.

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
`npm-staging` environment restricted to the default branch. Remote environment
rules and secrets have not been configured or verified; finish the
[publishing setup](publishing.md#staging-credentials) before enabling staging.

Real npm **11.21.2** ran against a temporary loopback registry with fake tokens.
It wrote only to staging endpoints, uploaded identical tarball bytes and skipped
lifecycle scripts. The first public CI run reached platform tests but Windows
failures prevented release aggregation. No secrets were uploaded and no real npm
staging, approval or publication occurred.

Further regressions reject malicious tarballs even with self-consistent hashes:
embedded `publishConfig`, changed identity or other manifest fields, private
packages, duplicate or hard-linked manifests and corrupt archives. The full entry
point refuses these before starting any npm subprocess. Receipt creation rejects
archives replaced after validation instead of recording new hashes. Final artifact
handoff uses the validation job's output artifact ID. Static workflow checks pass;
real GitHub handoff awaits a passing run of the corrected candidate.

That CI review passed 92 local tests; Node 24 glibc and musl containers each passed
29 staging tests, including loopback uploads with the real pinned npm CLI. All
nine actual packages passed manifest, content and receipt validation; actionlint
passed. Full review after fixes found no further issues. Temporary directories
and containers were cleaned and independently checked. Evidence is in
`artifacts/ci-review3-*.log`. The subsequent scope-migration run is recorded above.

## Current local status

The plugin and all nine npm packages remain unpublished. The latest completed
run recorded here tested `9ed6656` in the public
[GitHub repository](https://github.com/Golden-Pigeon/dsh-eu4-indexer). The SQLite
fix `50d399a` is merged into upstream main and available remotely, including its
nested submodule. The complete-set CRLF and explicit PATH corrections above are
the follow-up candidate. A passing full platform run and verified CI-produced
release set are still required before initial npm publication. GitHub writes follow the maintainer's current authorization, which
can cover necessary pushes and PR merges within an agreed open-source plan.

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
