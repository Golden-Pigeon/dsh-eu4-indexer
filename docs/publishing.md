# npm Publishing

## Publication authority

The maintainer must personally perform the first publication of all nine packages:
the main package and eight platform packages. Subsequent versions can only be
staged by CI, then approved personally by the maintainer with npm 2FA. CI does not
directly publish, approve or reject npm packages. A version tag triggers staging
and a GitHub Release automatically; the maintainer still approves npm publication.

All packages use the `@goldenpigeon` scope: `@goldenpigeon/dsh-eu4-indexer` and
`@goldenpigeon/dsh-eu4-indexer-engine-<platform-suffix>`. Before initial publication,
the maintainer must confirm their npm account can publish to that organization.
The CI token must also be restricted to these nine packages.

Initial publication of all nine `0.1.0` packages is complete. Their public hashes
match the original verified CI set; see [publication status](validation.md#publication-status).

The workflow uses npm **11.21.2** with official
[staged publishing](https://docs.npmjs.com/staged-publishing/) support. Staging a
new package directly exposes a public `0.0.0-stage` placeholder, so the script
requires real public versions of all nine packages before uploading anything.
Missing packages and packages with only placeholder versions block staging.

GitHub pushes, remote tags and releases follow the maintainer's authorization,
which can cover an agreed open-source plan. Editing CI or completing tests alone
does not authorize publication.

## Initial publication by the maintainer

Follow [builds and checks](packaging.md#builds-and-checks) to prepare the full
release set and complete platform, original DSH v0.2.2-rc.1 and real npm
installation tests. Inspect the nine tarballs in `artifacts/npm/`
and run `npm run verify:release`.

The main plugin has its own version. All eight platform packages use the pinned
upstream engine release version, referenced exactly by the main package's optional
dependencies. Publish and pin the upstream release before preparing an updated
engine set; see [version alignment](packaging.md#builds-and-checks). Release
receipts and staging validate each package's own version and the complete
dependency graph, including sets whose plugin and engine versions differ.

In your own terminal, sign in to npm and complete the required 2FA. Publish the
eight platform packages individually with
`npm publish <tarball> --ignore-scripts --access=public --registry=https://registry.npmjs.org/`.
Confirm all are installable before publishing the main package. Use the verified
tarballs rather than repacking from a source directory. For prereleases, explicitly
add `--tag=next` or `--tag=beta`.

Neither CI nor an agent performs this step. Configure later CI staging credentials
only after every package has been published initially.

## Staging credentials

In GitHub repository settings, create an **`npm-staging` environment**. Set
**Deployment branches and tags** to **Selected branches and tags**, with a Tag
rule for `v*` and no Branch rules. Save
**`NPM_STAGE_TOKEN`** as an environment secret. GitHub checks branch restrictions
before the job receives credentials. The release workflow also requires the tag
to match `package.json` and point to a commit on the default branch.
When migrating from the old manual flow, replace its `main` Branch rule with the
`v*` Tag rule before the next release; changing workflow files does not update
the remote environment. See [GitHub environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

Do not store the token as a repository or organization secret, where workflows on
other branches could reference it. If such a secret already exists, migrate it
and remove the old copy only with authorization for that operation. Local
workflow edits do not create these protections or upload secrets; finish the
settings before enabling staging.

Create a granular npm token that allows staging only, restricted to these nine
packages, with **bypass 2FA disabled** and account 2FA enabled. See
[npm stage-only tokens](https://docs.npmjs.com/about-access-tokens/#publishing-with-a-stage-only-token).
The registry rejects direct publication with a stage-only token. It still has
other write permissions and must be protected.

The local credential file `.secret/npm_token` is excluded by `/.secret/` in Git.
The main package uses a `files` whitelist; platform packages contain only their
engine and license files. Never put real tokens in configuration, command
arguments, logs or artifacts. Tests check ignore rules and actual npm packlists
without reading the token.

With explicit authorization for the upload, use GitHub's secret-management UI or,
after confirming the repository remote, standard input:

```sh
gh secret set NPM_STAGE_TOKEN --env npm-staging < .secret/npm_token
```

This configures an environment secret without publishing packages. Saving a local
token does not upload it, and the workflow never reads `.secret/`. Only the final
staging step receives `NODE_AUTH_TOKEN`; build, test, pull-request and ordinary
push jobs receive no npm credentials.

The credential-bearing job neither installs project dependencies nor builds or
executes compiled project artifacts. It runs staging scripts using only Node
built-ins and a separately installed pinned npm CLI. npm child processes use an
explicit CLI path, private temporary working directory and isolated configuration.
Children receive an explicit empty `PATH`, preventing Windows libuv from filling
an omitted value from the parent process.
They do not inherit project `.npmrc`, Node preload, proxy settings or unrelated
secrets. Configuration stores only a `${NODE_AUTH_TOKEN}` placeholder; npm debug
logs are disabled, and the temporary directory is removed afterwards.

Before invoking npm, system `tar` reads each archive's `package/package.json`
without extracting files or receiving credentials. The manifest must be one
regular file, and its full contents must match the source manifest in the current
commit. Duplicate or linked manifests, noncanonical paths, private packages and
embedded `publishConfig` block staging. CI supplies publication arguments so a
tarball cannot override proxy, TLS or other npm settings through `publishConfig`.

## Subsequent versions: CI stages, maintainer approves

CI follows the same event separation as
[dsh-remote](https://github.com/Golden-Pigeon/dsh-remote/tree/main/.github/workflows):

| Event          | Action                                                                              |
| -------------- | ----------------------------------------------------------------------------------- |
| Push to `main` | Build, typecheck and unit checks                                                    |
| Pull request   | Full native compatibility, npm installation and release-set validation              |
| Push `v*` tag  | Validate tag, build and validate packages, stage npm updates, create GitHub Release |

The PR and release workflows share `package-tests.yml`. It has only a
`workflow_call` trigger and no npm credentials. Ordinary branches, PRs and manual
dispatches cannot stage packages.

1. Update the main version and pin the upstream engine release, then run
   `npm run prepare:engines` to synchronize platform packages and exact dependencies.
   Platform versions follow upstream, independently of the main version. Update
   locks and the changelog, and test locally.
2. Land reviewed changes on the default branch. With authorization, create and
   push a tag matching the main version, such as `v0.1.2`. This automatically
   starts `release.yml`; no separate manual staging dispatch is needed. Stable
   versions use `latest`, and prereleases use `next`.
3. Credential-free jobs build and test all platforms, musl containers and original
   rc.1 installed packages. Aggregation records the source commit and all nine
   candidate names, exact versions, filenames and SHA-512 hashes before full
   validation, then checks the bytes remain unchanged. It never replaces recorded
   hashes after validation. Only a successful set is uploaded as
   `verified-npm-release`. The separate staging job downloads the exact artifact ID
   output by validation and checks the commit, complete package set, dependency
   versions, hashes and full manifests. It invokes
   `npm stage publish <tarball> --ignore-scripts` for platform packages before the
   main package, using the official registry and no artifact lifecycle scripts.
4. CI preflights all nine packages: initial publication must be complete, and local
   artifacts must exist and remain unchanged. Already public versions are reused,
   allowing a plugin update to keep the same upstream engine version.
   It uses only `npm stage publish`, without requiring permission to list stages.
   npm's shared version index rejects already staged or published versions; any
   failure stops the job without retrying. Each successful stage adds the name, version,
   tag, stage ID and SHA-512 to the Actions summary. npm's returned name, version
   and integrity must match the uploaded tarball.
5. The summary stays **IN PROGRESS** until every package is staged or already
   public and local cleanup finishes, then becomes **COMPLETE**. Wait for the
   entire staging job to succeed.
   In npmjs.com's **Staged Packages**, inspect each stage and download tarballs if
   needed. Personally approve pending platform packages with 2FA, confirm they
   are installable, then approve the main package. In your own terminal you can
   also use `npm stage view <stage-id>`, `npm stage download <stage-id>` and
   `npm stage approve <stage-id>`. Approval commands never run in CI.

Pushing a release tag requests automatic staging and GitHub publication. It does
not approve publication on npm; the workflow has no direct-publication step.

## GitHub Releases

After successful staging, the separate `github-release` job publishes the tagged
release automatically. It downloads the same verified artifact by ID, verifies
its source commit and package hashes again, and attaches all nine original
tarballs and `release-set.json` without rebuilding. Notes come from the matching
version in `CHANGELOG.md`; `Unreleased` and older entries are excluded.

Only this job receives GitHub `contents: write`; it has no npm token. The staging
job retains `contents: read`. A GitHub Release can be available while npm stages
await personal approval. Existing release assets are not overwritten on rerun.

## Failure recovery

Nine staging writes are not atomic. A network error or failed package stops the
job; successful stages remain on npm and their IDs remain in the summary. A lost
response may also follow a successful write. CI does not automatically retry
writes, approve or reject stages.

Rerun build or validation jobs explicitly replace same-name intermediate artifacts.
Staging downloads by validation's unique artifact ID, never by selecting a name
again. If a later rerun deleted that ID, download fails rather than silently
substituting another artifact.

Inspect the summary and npm staged state first. An existing pending version is
rejected by the registry, stopping the job at that package. The maintainer can
personally reject a partial set before retrying; CI never rejects or approves it.
Already public versions are skipped. Do not approve a partial set. Published
content cannot be replaced: change the plugin version or publish a new upstream
engine version as appropriate. Distribution tags cannot be changed after staging;
reject the old stage before restaging with another distribution tag.

Fix configuration before retrying a failed job on the original tag. Rerunning
only the failed staging job reuses its verified artifact; it does not require a
temporary workflow, hardcoded run IDs, replaced source metadata or repeated builds.

Local regressions use a temporary loopback registry and fake credentials. They
check real npm with the production npmrc and fake tokens: authentication headers,
registry `401` handling, staging-only endpoints, identical bytes and disabled
lifecycle scripts. They never write to real npm endpoints. Run `actionlint` locally
before submitting workflow changes.
