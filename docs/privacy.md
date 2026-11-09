# Privacy Review

This page records the **2026-11-08** review scope, fixes and retained content.
Commit attribution, public repository URLs and license author information are
preserved. Detailed local scans are in `artifacts/privacy-review/` and are not
shipped in npm packages.

## Scope

- Current source in this repository, the eu4-indexer submodule and nested CWTools,
  including new uncommitted files.
- Historical file content and commit messages reachable from all local Git refs
  in this repository and eu4-indexer, excluding commit identity fields. Full
  CWTools history was not traversed.
- The actual main and eight platform npm packages, including internal engine
  files, UTF-8/UTF-16 strings, PDB/PE debug metadata and archive headers.
- Personal directories, usernames, email addresses, server addresses, private
  keys, access tokens, credential-bearing URLs and hardcoded passwords. Matches
  were reviewed to distinguish real private data, test placeholders, assembly
  versions and public license information.

## Findings and fixes

No real keys, tokens, passwords or private server addresses were found in current
first-party source or documentation. Earlier engine builds contained personal
source paths in `eu4indexer.dll` and `CWTools.dll`: F# reference information and
assertion strings can retain physical paths even with mapped PDB document paths.

Engines now build from Git-tracked source copied to a neutral temporary directory,
excluding untracked files and Git configuration. The copy is removed after
success or failure. Before archiving, builds scan first-party and CWTools
assemblies for personal-directory bytes. The engine lock's `sourcePathPolicy`
prevents old receipts being accepted as new artifacts. All eight engines were
rebuilt. Reinspection of main and platform package contents, internal engines and
archive metadata found no local builder home, workspace path or personal owner
information.

Archives also previously retained the local username, UID/GID, macOS extended
attributes and AppleDouble entries. Tar now uses empty owner names, zero UID/GID,
and no extended attributes or ACLs. ZIP archives created on Unix omit owner
extension fields. File contents, licenses and executable permissions are retained.

Unix builds default to `/tmp`; Windows uses Public Documents. Set
`DSH_EU4_BUILD_TEMP` for another staging location outside personal home directories.
This affects development builds only, not the plugin's user-data directory.

## History and third-party content

Older eu4-indexer `Eu4Indexer.Tests/TestPaths.cs` revisions contained three
personal paths. History was rewritten with git-filter-repo, then the cleaned two
remote branches and six version tags were pushed atomically to GitHub. All eight
remote refs were independently checked. Across 89 commits, commit identities were
unchanged and historical content changes were limited to these paths. Current
remote branch source trees were unchanged.

The local upstream repository and this plugin's submodule were synchronized to
the rewritten history, with byte-for-byte preservation of staged and uncommitted
files. The plugin lock and eight platform receipts were updated to the new
commit identities. Source trees were verified identical at that time, so engine
archive bytes were preserved. Old hashes in historical review notes may predate
that rewrite; `engine.lock.json` is authoritative.

GitHub still retained nine read-only PR refs and allowed old commits to be
accessed by SHA. Normal Git pushes cannot remove these internal refs and caches.
Cleaning branches and tags therefore does not establish physical deletion of all
old GitHub objects. Under [GitHub's removal process](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository#fully-removing-the-data-from-github),
GitHub Support must dereference old PR refs and clear caches and server objects.
A request was prepared in the ignored local file
`artifacts/privacy-review/github-support-request.md`, but has not been submitted.
The repository API reported no forks at review time.

Public CWTools source retains its original maintainers' development paths. Some
NuGet dependencies contain their maintainers' or CI debug paths. These are not
this plugin builder's private data. Original third-party binaries, signatures
and licenses were preserved without binary replacement or path scrubbing.

Ignored logs, old builds and audit artifacts may still contain local paths. They
are outside the npm file set and Git changes intended for commit. Do not upload
all of `artifacts/` as a release attachment. See [validation](validation.md) for
platform runtime coverage and [packaging](packaging.md) for build and release-set
checks.
