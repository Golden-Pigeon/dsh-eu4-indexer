# npm Publishing

## Publication authority

The maintainer must personally perform the first publication of all nine packages:
the main package and eight platform packages. Subsequent versions can only be
staged by CI, then approved personally by the maintainer with npm 2FA. CI does not
directly publish, approve or reject packages, or create remote tags or GitHub
Releases.

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
installation tests. Inspect the nine same-version tarballs in `artifacts/npm/`
and run `npm run verify:release`.

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
**Deployment branches and tags** to **Selected branches and tags**, with a Branch
rule for the default branch only (for example, `main`) and no Tag rules. Save
**`NPM_STAGE_TOKEN`** as an environment secret. GitHub checks branch restrictions
before the job receives credentials; the workflow's default-branch check is an
additional guard. See [GitHub environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

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

1. Update the main version, run `npm run prepare:engines` to synchronize platform
   packages and exact dependencies, update locks and the changelog, and test locally.
2. With authorization for the push, land changes on the default branch. In GitHub
   Actions, choose **Run workflow** on `package-tests`, select the default branch,
   set **stage** to `true` and choose `latest`, `next` or `beta`. `latest` rejects
   prereleases. Staging is disabled by default and blocked on other branches.
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
4. CI preflights all nine packages: initial publication must be complete, target
   versions must be neither public nor staged, and local artifacts must exist and
   remain unchanged. Each successful stage immediately adds the name, version,
   tag, stage ID and SHA-512 to the Actions summary. npm's returned name, version
   and integrity must match the uploaded tarball.
5. The summary stays **IN PROGRESS** until all nine stages succeed and local cleanup
   finishes, then becomes **COMPLETE**. Wait for the entire staging job to succeed.
   In npmjs.com's **Staged Packages**, inspect each stage and download tarballs if
   needed. Personally approve the eight platform packages with 2FA, confirm they
   are installable, then approve the main package. In your own terminal you can
   also use `npm stage view <stage-id>`, `npm stage download <stage-id>` and
   `npm stage approve <stage-id>`. Approval commands never run in CI.

Triggering GitHub Actions and approving publication on npm are separate actions.
**Run workflow** requests staging only; the workflow has no direct-publication
step bypassing maintainer approval.

## Failure recovery

Nine staging writes are not atomic. A network error or failed package stops the
job; successful stages remain on npm and their IDs remain in the summary. A lost
response may also follow a successful write. CI does not automatically retry
writes, approve or reject stages.

Rerun build or validation jobs explicitly replace same-name intermediate artifacts.
Staging downloads by validation's unique artifact ID, never by selecting a name
again. If a later rerun deleted that ID, download fails rather than silently
substituting another artifact.

Inspect the nine packages' staged state first. An existing stage for the same
version blocks any new uploads on rerun. The maintainer can personally reject the
existing stages, then rerun the complete release set. Do not approve a partial
set before the whole staging job succeeds. Already public versions cannot be
replaced; prepare and test a new common version. Tags cannot be changed after
staging; reject the old stage before restaging with another tag.

Local regressions use a temporary loopback registry and fake credentials. They
check that the real npm CLI writes only to staging endpoints, uploads identical
bytes and does not run lifecycle scripts. They never write to real npm endpoints.
