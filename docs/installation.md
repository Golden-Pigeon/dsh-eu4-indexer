# Installation

The published package is `@goldenpigeon/dsh-eu4-indexer`. Requirements and engine
platform selection are described in the [README](../README.md#installation).
For unpublished artifacts, see [local installation](packaging.md#local-installation).

## Web

Install into the profile you use:

```sh
dsh plugin --profile web add @goldenpigeon/dsh-eu4-indexer
```

## macOS Desktop

DSH v0.2.2-rc.1 Desktop includes its own CLI and package manager. Use that command
to manage the `desktop` profile. The separately installed npm CLI does not manage
the reserved Desktop profile.

Open Desktop once to initialize its profile, then fully quit it before changing
its packages. For the default application location:

```sh
dsh_cli='/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh'
"$dsh_cli" plugin --profile desktop add @goldenpigeon/dsh-eu4-indexer
```

Reopen Desktop after installation and follow the [usage guide](usage.md).

## Migrating a local unscoped installation

Earlier local development builds used `dsh-eu4-indexer` without the
`@goldenpigeon` scope. That name was never published to npm. Adding the scoped
package does not replace an existing dependency under the old name: pnpm also
resolves dependencies already recorded in the profile's `package.json`.

If installation reports this URL even though you entered the scoped name:

```text
GET https://registry.npmjs.org/dsh-eu4-indexer: Not Found - 404
```

Check the affected profile for the old dependency. For Desktop, fully quit the
application, define `dsh_cli` as above, and remove the old package first:

```sh
"$dsh_cli" plugin --profile desktop remove dsh-eu4-indexer
```

After removal succeeds, install the published package:

```sh
"$dsh_cli" plugin --profile desktop add @goldenpigeon/dsh-eu4-indexer
```

The rc.1 CLI removes the old dependency and bundle selection, then registers the
scoped bundle on installation. It preserves `cordis.patch.yml` and the plugin's
data directory. For Web, use `dsh plugin --profile web` with the same `remove`
and `add` arguments. A clean profile needs only the `add` command.
