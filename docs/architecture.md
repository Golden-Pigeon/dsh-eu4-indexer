# Project Structure & Architecture

The DSH adapter reuses the upstream parser, database model and game queries. The
pinned submodule's `manage` command exposes Discovery, Pipeline,
IndexInputs and Registry through versioned JSONL; `serve` provides all upstream
query tools. See the [management reference](management.md) for plugin operations
and the [upstream protocol](../resources/docs/management.md) for engine details.

## Code layout

```text
external/eu4-indexer/     Upstream: parsing, databases, management API, query sessions
src/engine/               Public TS library, npm engine lookup, JSONL, session launch, verification
src/indexing/             Persistent tasks, queuing, cancellation, restart recovery
src/integration/          Session MCP clients, selection coordinator, skills, preview HTTP
src/client/client.tsx     DSH slot UI and English/Chinese text
src/client/host.ts        Browser loader and host-service types
src/contracts.ts          Shared request, response, task and state types
src/service.ts            Management operations, chat defaults, cross-task constraints
src/index.ts              Cordis plugin, authenticated RPC, management tools
dist/                    Generated runtime code, declarations and source maps
resources/skills/         Skills generated from pinned upstream
resources/docs/           Generated upstream protocol and dependency references
packages/engine-*/        Separate npm engines for each OS, CPU and libc
scripts/                  Builds, packaging, validation and local preview
docs/                    Usage, interface, architecture, packaging and validation
```

Production source uses strict TypeScript, with TSX for the management UI.
`src/contracts.ts` shares operation-specific request and response types, task
state and session state. `src/client/host.ts` describes the rc.1 browser loader
and host services. `dist/` supplies the JavaScript, declarations and source maps
loaded by npm and DSH. React is injected by the host; the compiler is a development
dependency. Node build scripts and tests against compiled output remain `.mjs`.

Builds type-check and compile in memory before clearing old output. Compilation
diagnostics preserve the last runnable artifacts. See
[CONTRIBUTING.md](../CONTRIBUTING.md) for conventions and commands.

## Tasks and concurrency

`IndexerService` is shared by the UI and model tools. Short operations go to the
engine; long operations go through `Tasks`. Changes to the same index name are
exclusive, and external engine switches wait for background
tasks. Task logs are bounded: raw progress stays in memory, while terminal state
and results are persisted. Tasks awaiting their first journal write are included
in cancellation and disposal. Only persisted tasks may execute; cancellation
before persistence completes prevents a later start. Disposal cancels work and
waits for child processes. Restart marks unfinished records as `interrupted`
without repeating builds.

Management reads may run concurrently; mutations enter serially. No index task
starts during configuration probing, persistence or connection switching. `tasks` and `cancel_task` remain available during
this gate. If pausing connections fails, all clients finish cleanup before
reconnection; settings are saved only after a successful pause. Cancellation is
checked again after pausing and does not recreate connections still in use.

## Sessions

A single permanent `eu4_indexer_tools` loader enables tools for the executing
Agent. The 16 management registrations use the original rc.1
`ctx.tools.register(..., { when })` predicate. DSH resolves it once per model step
for both request schemas and dispatch; an unloaded management tool cannot be
called just by knowing its name. The predicate only reads state and never starts
work. `tools.definitions()` outside a step includes conditional registrations
and must not be used to measure what the model receives.

Activation is held in a WeakSet of live Agent objects. It is independent of
persisted chat defaults and is cleared on disposal or replacement, including
rc.1 restoring an Agent with the same ID. Unloading waits for queries through the
selection coordinator, disposes the MCP client and hides management tools from
subsequent steps. Cancelling activation aborts its registry request and disposes
a client still initializing, awaiting transport cleanup before releasing the
coordinator. Shutdown closes clients to interrupt queries, then drains active
coordinator work, including unloads which have already removed their bindings.
Saved defaults and background jobs remain. Visibility controls
context size; normal host permissions and approvals still apply.

Each enabled `agent.ctx` mounts an official `@deepseek-ai/dsh-mcp-client`, with
`serverName` set to `eu4`; DSH scopes isolate tool registration. It starts the
engine with `serve --db <path> --query-session <agent.id>`. Changing a chat's
default closes its old connection before creating another; failure restores the
old connection. Task completion identifies affected chats from persistent
defaults, initial connection indexes and current temporary MCP selections, then
reconnects them. External engine changes dispose clients before reconnecting. rc.1
can reuse an ID when restoring a chat: disposal state follows the particular
Agent object, so a newly enabled object can connect and delayed cleanup of the old object
cannot close the replacement.

Default bindings persist. Runtime `select_database` affects only that MCP query
session and disappears when its process exits. Rebuilds and reconnections restore
the persistent default. The management page and removal protection read actual
selection through MCP's `list_databases`, rather than treating a saved default as
the current selection. Queries may run concurrently; selection changes, bindings,
automatic connection/reconnection and removal share an exclusive coordinator.
Removal blocks selection of the target index and waits for existing queries
before checking and removing it. Failure to read selection prevents removal.

State polling holds shared query access while reading actual selection.
Reconnection, pausing and Agent disposal wait for that check, preventing a
connection from closing halfway through the management page's read.

`register` can replace a registered path under the same name. It waits for affected
chats to reconnect before returning, so subsequent queries do not keep using the
old database. Other chats keep their connections. Import is refused during a
build of the same name, preventing build completion from overwriting the import.
Affected chats restore their persistent defaults, as after a rebuild.

Upstream also accepts `_meta["eu4indexer/sessionId"]` on each `tools/call` over a
shared MCP connection. Each ID has its own selection, independent of the connection
default and other IDs. Omitting it, without `--query-session`, preserves existing
client behavior. `close_query_session` releases a named session; closing the
connection releases all state. Session IDs isolate state; the host controls
identity and permissions.

See [chats and skills](usage.md#chats-and-skills) for user-facing selection rules.

## Data and installation

Under `home`, `config.json` is the upstream registry, `db/<game>/` stores immutable
database versions. Bundled rules live in the npm engine
package's `bin/rules/<game>/`; external config directories are optional overrides. `sessions.json`, `tasks.json`
and `settings.json` belong to the plugin. Failed rebuilds preserve the original
database. Successful replacement retains old versions for existing readers;
cleanup is not automatic. Forced termination may leave unregistered `.building`
files; remove them only after confirming no build process remains. External
database imports register paths by default, and files outside the managed
directory cannot be deleted through the plugin.

The public `@goldenpigeon/dsh-eu4-indexer/engine` entry exports the typed
`Engine` library without importing DSH or Cordis at runtime. Management tools
call this library directly. It resolves the exact platform dependency using the
plugin package as its module-resolution anchor, verifies its complete publish
file inventory and provenance, and invokes the executable in that package's
`bin/` directory. `querySession()` provides a distinct MCP launch configuration
for each chat; DSH owns the client and child-process lifetime.

The eight platform packages contain complete self-contained .NET publish trees,
including native runtime files and licenses. npm handles installation, platform
selection and upgrades. There are no nested archives, postinstall scripts,
user-directory copies or runtime engine downloads. Both game-rule repositories
are included in each publish tree, so engine and rules follow the plugin version.
Legacy `home/engine/current` and `home/config/<game>` copies are ignored and
preserved. Bundled-rule refreshes resolve the current engine; external rule paths
remain selected.

Package receipts bind every publish file, API, source commit, SDK and RID to the
plugin's exact dependency version. Missing, damaged or mismatched dependencies
produce actionable package errors and cannot fall back to a stale engine copy.
The plugin and panel remain available to correct an external path or diagnose
a missing package. External executables are probed for management API
compatibility; users manage their updates. Relative external paths are saved as
absolute paths so MCP startup does not depend on the data directory's location.
See [packaging](packaging.md) for the receipt format and
[validation](validation.md) for executed platform coverage.

Independent DSH hosts need separate `home` directories to avoid sharing task
journals and chat defaults. The upstream registry uses an interprocess lock and
atomic replacement, but does not coordinate application-level builds of the same
name. Removal and manual cleanup must also account for external MCP readers,
which the plugin cannot enumerate.

## DSH integration and permissions

The production UI sends Connection RPC envelopes through a separate Fetch route,
`/api/eu4-indexer/dispatch`. It reuses DSH authentication, owner-principal checks,
body-size limits and cancellation signals without claiming the Gateway's sole
`/api` RPC interceptor.

Commands and parameters use argv and JSON, without shell interpolation. Both
management child processes and official MCP clients strip host credentials from
their environments. The plugin manages authorized local files, rules and engines
without exposing a separate public management endpoint.

## Skill registration

Registration does not read conversation text or UI locale and uses no language
detector. The model catalog has four complete entries: `eu4-zh`, `eu4-en`,
`hoi4-zh` and `hoi4-en`. Their descriptions and instructions guide the model to
choose by conversation language. Loaded skill bodies instruct the model to call
the permanent loader before game tools and to unload when returning to unrelated
work. Loading a skill alone does not execute plugin operations. The legacy `language` setting is accepted for
compatibility; no value changes which skills are registered.

`eu4` and `hoi4` remain language-neutral entry points for explicit user invocation.
They stay out of automatic model discovery to avoid duplicates. All translations
are always available, with independent loading in each chat. Registration failure
rolls back prior contributions; disposal releases skills and browser dictionaries.
See [chats and skills](usage.md#chats-and-skills) for language switching.
