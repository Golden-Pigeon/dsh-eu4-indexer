# Changelog

## Unreleased

## 0.1.1 — 2026-11-10

- Normalize upstream skill line endings before adapting them, so Windows builds
  remove obsolete setup instructions and generate the same four skills as Unix.

- Version all eight platform binary packages with upstream engine `0.4.0`,
  independently of plugin `0.1.1`. Pin the upstream release and verify source
  version, exact dependencies, mixed-version release receipts and upgrades.

- Propagate chat-tool activation cancellation to registry requests and MCP startup,
  and await client/query cleanup when shutdown overlaps an unload.

- Load management and MCP query tools on demand per chat through
  `eu4_indexer_tools`, using original DSH rc.1 conditional tool registration.
  Unloading retains background jobs and defaults; restored chats start unloaded.

- Bundle both games' pinned rule repositories inside the engine. Remove upstream
  `setup`, plugin rule downloads and `install_engine`; refresh default rules from
  the current engine while retaining explicit external directories.
- Replace `eu4_indexer_manage` with 16 independent management tools, preserving
  chat isolation, task handling and the existing query tool set.

- Expose a DSH-independent TypeScript engine library at `@goldenpigeon/dsh-eu4-indexer/engine`; plugin management and session launch use it directly.
- Install and update the engine with the plugin through exact-version platform dependencies. Ship complete .NET publish directories, verify all file hashes, and remove the separate engine activation requirement. Preserve external engines, data and session isolation.
- Keep management `state` output valid lossless JSON when an engine is unavailable by omitting the absent environment field.

- Document Desktop's bundled CLI and migration from the unpublished local package name to `@goldenpigeon/dsh-eu4-indexer`, including the stale-dependency 404.

## 0.1.0 — 2026-11-10

- Upload platform engines separately from the tested Linux x64 main package, preventing concurrent same-name writes during CI release-set aggregation.

- Normalize the Windows ZIP extraction root before checking entries, allowing 8.3 temporary paths while retaining traversal and link rejection. Add native Windows malicious-ZIP regressions.

- Pass the original DSH rc.1 integration preload as a file URL so Windows runs the installed-package tests instead of interpreting a drive letter as a URL scheme.

- Reuse checked CRLF-aware archive paths throughout complete release-set validation, and explicitly clear npm child-process PATH to prevent Windows from restoring the caller's path.

- Handle Windows tar's CRLF output in npm manifest verification without trimming unsafe filename characters. Keep subprocess and stale-source regressions portable, and allow the full Cordis/MCP integration enough time on slower native CI runners.

- Release native SQLite handles after MCP queries and refresh-input reads, preventing Windows file locks and stale reads after same-path database replacement. Add native-handle and replacement regressions, centralize test database cleanup, and run upstream fixture tests on Linux, macOS and Windows.

- Move the main package and all eight platform packages to the @goldenpigeon scope, including exact optional dependencies, npm archive names, registry routes, DSH browser registration and release receipts.
- Check complete packed manifests against trusted source metadata before exposing npm credentials, reject archive-controlled publishConfig and ambiguous or linked manifests, and keep candidate hashes unchanged across validation. Hand verified artifacts to staging by ID, support explicit replacement on reruns, and mark staging complete only after cleanup.
- Isolate npm staging credentials from project dependencies and builds, bind the nine verified archives to the workflow commit and exact dependency versions, use a branch-restricted environment secret, and mark partial staging as unready for approval. Run npm through an explicit CLI path with private configuration, a minimal environment and no debug logs.
- Keep initial npm publication owner-operated; add opt-in CI staging of verified updates with owner approval on npm, complete-set preflight checks and per-package stage receipts. Exclude local `.secret/` credentials from Git and verify the actual npm packlist.
- Update the engine to include the upstream Windows management-path normalization fix, with consistent index, refresh, register and list responses.
- Align the engine lock and receipts with the sanitized upstream history after verifying identical source trees and preserving existing engine archive bytes.
- Build engines from a neutral tracked-source snapshot, reject embedded personal build paths, and strip local ownership and filesystem metadata from engine archives. Rebuild all eight platform packages and reject older build receipts.
- Organize documentation around a concise README, a contributor guide, and separate usage, management, architecture, packaging and validation references; retain detailed review history in an archive.
- Migrate production code to strict TypeScript and the browser UI to TSX, with shared management types and compile-time contract regressions. Ship JavaScript, declarations and source maps from `dist/`, retaining the original rc.1 browser loader and host dependencies.
- Verify packed JavaScript against an in-memory compilation of current TypeScript and check the published declarations from real npm/pnpm consumers.
- Preserve prototype lifecycle hooks, synchronous default coordination and tool executor receivers during the TypeScript migration. Keep browser types out of the host's global scope, allow typechecking without generated files and build before the optional desktop-runtime test.
- Retain the last working JavaScript, declarations and source maps when TypeScript reports an error; clean obsolete output only after a successful in-memory compilation.
- Fail checks and engine packaging when a subprocess cannot start or is terminated by a signal; never record a partial engine archive as a successful build.
- Check an already-installed managed engine against the current plugin lock, including source, API, SDK, platform and npm package version. Report an update requirement for stale or legacy receipts and recover through offline reinstallation.
- Reconnect affected query sessions after importing a replacement under an existing index name; reject imports that conflict with an active build of that name.
- Hide late mod-choice responses belonging to another game after switching the build form.
- Serialize engine configuration, management mutations and activation; drain live queries before replacing engine files while keeping task polling and cancellation available.
- Preserve the original engine settings and resume scoped clients when suspension fails or cancellation arrives before activation. Coordinate state inspection and Agent disposal with connection changes.
- Compare every shipped main-package file with the workspace during release verification, rejecting stale runtime code and unexpected files even when version and engine metadata match.
- Normalize and persist external engine paths so scoped MCP clients can launch them from their own working directory.
- Upgrade the bundled SQLitePCLRaw 2.x runtime to 2.1.14 for CVE-2025-6965, retain FTS5, and audit all direct/transitive NuGet engine dependencies in CI.
- Pin the build SDK to .NET 9.0.315 in local builds and CI, align the reviewed FSharp.Core version, and verify SDK provenance in engine package receipts.
- Reconnect chats that temporarily selected a rebuilt index, and coordinate automatic connections/reconnections with registry changes.
- Honor cancellation and shutdown while initial task journal writes are pending; never start work after its signal was cancelled.
- Restore scoped MCP connections when rc.1 resumes a chat using the same session id; ignore delayed disposal of the previous Agent instance.
- Check the pinned, clean upstream source before generating main-package skills/docs as well as engine binaries, and reject stale packed engine locks or DSH metadata during release-set verification.
- Run the installed npm tarball against isolated, original rc.1 dependencies in CI, including the musl container, rather than testing workspace source alone.
- Preserve npm/pnpm argument boundaries on Windows, including paths containing spaces, and fail packaging when the package-manager process cannot start.
- Split engines into eight OS/CPU/libc npm packages with exact optional dependencies; the main plugin contains no binaries.
- Add reproducible platform packaging, license/notice collection, local registry installation checks and complete release-set validation.
- Report actual MCP database selection and protect in-use indexes during concurrent selection/deletion.
- Allow clearing an external engine before the first managed-engine installation.
- Keep DSH v0.2.2-rc.1 as the compatibility baseline: test its original SDK in an isolated install and use the installed Desktop's own Node and dependencies for local integration checks. Retain patched development dependencies as additional regression coverage.
- Fix the Desktop management page returning 404 by registering an owner-only Connection Fetch route alongside the existing Gateway interceptor; exercise the real Connection transport in integration tests.
- Release browser dictionaries when the plugin unloads so disabling and re-enabling restores the management panel. Hide outdated source previews after form changes, including late asynchronous replies, and show an accurate session selector placeholder.
- Validate the real rc.1 Web client in a separate profile and data directory, including packaged engine installation, rules download, index construction, binding and deletion protection.
- Update the engine's pinned upstream, pin HOI4 rules to `297dd69c`, and expose new doctrine relationships, modifier templates, naval-hook event lists and expression-aware effect analysis through DSH's existing MCP bridge. Recheck CWTools/EU4 pins, regenerate both HOI4 skill translations and include dependency feature coverage in the package.

- Let the LLM select Chinese or English game skills from the conversation. Expose four localized entries, retain `/eu4` and `/hoi4` as language-neutral user entry points, and stop using the legacy `language` setting to choose content.

- Add complete DSH management for EU4/HOI4 engine, rules, game/mod discovery, immutable indexes, imports, diagnostics, background tasks and session defaults.
- Reuse eu4-indexer as a pinned Git submodule, with additive generic management and upstream query-session APIs.
- Add scoped official MCP clients, generated bilingual game skills, authenticated owner-only management RPC, browser UI and local packaging/tests.

- Pinned upstream source: `50d399a5c6b03e278e117284b83979114e560a48`.
