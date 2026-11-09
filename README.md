# DSH EU4 Indexer

Manage and query **Europa Universalis IV** and **Hearts of Iron IV** game and mod
scripts in DeepSeek Harness.
Build indexes, manage CWTools rules, track background jobs, and query each chat's
selected database through MCP. Parsing and game queries come from
[eu4-indexer](https://github.com/Golden-Pigeon/eu4-indexer), pinned as a git
submodule.

## Contents

- [Architecture](#architecture)
- [Highlights](#highlights)
- [Installation](#installation)
- [Usage](#usage)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License and acknowledgements](#license-and-acknowledgements)

## Architecture

The upstream engine provides the parser, database model, management protocol and
MCP query tools. This repository adds the DSH plugin, a TypeScript/TSX management
UI, background tasks and chat connections. Each chat uses an independent official
DSH MCP client to select its database. See [docs/architecture.md](docs/architecture.md)
for the layout, lifecycle and concurrency model.

## Highlights

- **Game and mod discovery** — local installs, Steam Workshop items and launcher
  playsets for EU4 and HOI4.
- **Index management** — create, refresh, import, inspect and remove indexes;
  browse paginated parse errors with file locations.
- **Background tasks** — persistent progress and results, queuing, cancellation
  and interrupted-task recovery. Failed rebuilds preserve the previous index.
- **Chat isolation** — independent default indexes with all upstream
  `mcp__eu4__…` query tools.
- **English / Chinese skills** — the model chooses the appropriate EU4 or HOI4
  skill from the conversation language, independently of the UI locale.
- **Authenticated management UI** — owner access through DSH's connection;
  hosts without a browser connection can still use management tools and MCP.

## Installation

Requires **DSH v0.2.2-rc.1** (declared range `>=0.2.2-rc.1 <0.3.0`) and
Node.js 24+. The engine bundles the .NET runtime; Linux also needs the
[platform's native libraries](docs/packaging.md#linux-native-dependencies).

The packages are **not yet published to npm**. For local artifacts, see
[local installation](docs/packaging.md#local-installation). Once published:

```sh
dsh plugin --profile web add @goldenpigeon/dsh-eu4-indexer
```

Exact-version optional dependencies select the engine package for the host's OS,
CPU and libc, downloading only the matching binary by default. To build from
source, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Usage

Open the plugin's **Game script indexes** configuration page:

1. In **Engine & settings**, install the managed engine and download the rules
   for the games you need.
2. Select a game, mods and an index name, preview the sources, then build.
3. Bind an index to a chat and ask about events, missions, focuses, conditions,
   modifiers or game goals.

The `eu4_indexer_manage` tool also manages indexes. `/eu4` and `/hoi4` are explicit
skill entry points. Configuration, tasks, chat selection and upgrades are covered
in the [usage guide](docs/usage.md); operation parameters are in the
[management reference](docs/management.md).

## Documentation

- [Usage Guide](docs/usage.md) — configuration, engine and rule setup, indexes,
  tasks, chat bindings and skill languages.
- [Management Reference](docs/management.md) — `eu4_indexer_manage` operations,
  parameters and task results.
- [Project Structure & Architecture](docs/architecture.md) — modules, lifecycle,
  concurrency and data boundaries.
- [Packaging & Local Installation](docs/packaging.md) — platform packages,
  builds, native dependencies and artifact checks.
- [Publishing](docs/publishing.md) — manual initial publication, subsequent CI
  staging, credentials and maintainer approval.
- [Validation](docs/validation.md) — rc.1 compatibility, tested platforms and
  coverage limits.
- [Privacy Review](docs/privacy.md) — personal-data checks, build-path fixes and
  retained history and third-party content.
- [Upstream Dependency Coverage](resources/docs/dependencies.md) — CWTools and
  game-rule pins, including new HOI4 query support.
- [Changelog](CHANGELOG.md) — features and behavior changes.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, conventions, tests, isolated Web
validation and the submodule update workflow.

## License and acknowledgements

This plugin is licensed under [MIT](LICENSE). The indexing engine comes from
[eu4-indexer](https://github.com/Golden-Pigeon/eu4-indexer), with script parsing
provided by [CWTools](https://github.com/cwtools/cwtools). The
[upstream license](resources/UPSTREAM-LICENSE) and full engine third-party notices
are included in the packages. Game files, mods and user-generated databases are
not distributed in the npm packages.
