# Usage Guide

This guide covers operations after installation. Start with the
[README](../README.md#installation) for installation or the
[contributor guide](../CONTRIBUTING.md) for source development.

## Engine and rules

Open **Game script indexes** in the plugin configuration page, then install the
managed engine under **Engine & settings**. Installation verifies, extracts and
activates the engine offline from the installed platform npm package. It does not
run installation scripts or compile locally. Downloading CWTools game rules still
requires a network connection; install the rules you need for EU4 and HOI4
separately.

To use an existing compatible engine, enter its executable path in **Engine &
settings**. It must support management API 1, and you are responsible for updating
it. Clear the path to switch back to managed installation.

After a plugin upgrade, the managed engine's source, SDK, platform and package
version must match the plugin lock. Missing, stale or mismatched installation
receipts require an update. **Install / update managed engine** restores it from
the local platform package while preserving indexes. If optional dependencies
were disabled, reinstall the matching platform package as prompted or configure
an external engine.

Linux glibc and musl engines are distributed separately; see
[native dependencies](packaging.md#linux-native-dependencies). When moving to
another machine, reinstall dependencies for the target Node platform and CPU.

## Games, mods and indexes

1. Select the game and index name in the build tab. Leave the game directory
   blank for auto-detection or enter a local path.
2. Add mod directories, Workshop items or a launcher playset, and adjust load
   order as needed. Preview the resolved sources before building.
3. Follow progress under background tasks. When complete, inspect metadata and
   parse errors in the index list. Errors include file locations and pagination.
4. Refresh the index after game or mod updates. Refresh resolves the original
   saved mod selection again. Refresh after rule updates too, to populate new
   derived relationships.

Builds and refreshes publish separate database versions; failure or cancellation
preserves the previous index. Old versions remain available to existing readers
and are not automatically removed. Importing a compatible database registers its
path by default. Removal unregisters by default; file deletion is allowed only
inside the plugin-managed database directory. Bound indexes, active query
selections and indexes being built are protected from removal.

See [upstream dependency coverage](../resources/docs/dependencies.md) for HOI4
doctrine relationships, modifier templates and script-expression queries. Refresh
existing HOI4 indexes after installing updated rules to obtain the new derived
relationships.

## Chats and skills

Bind a default index to a chat, then ask about game content directly or invoke
`/eu4` or `/hoi4`. Each loaded chat uses its own official DSH MCP client. Tool
names remain `mcp__eu4__…`, and one chat's selection does not affect another.
Unbinding closes that chat's query connection. The management page can also clear
saved defaults for closed chats.

A persistent default binding differs from MCP's temporary `select_database`
selection. Temporary selection lasts only for the current query connection;
reconnection or rebuilding an affected index restores the persistent default.
The management page shows the actual query selection. Without a binding, the
registry's active default or sole index is used. Multiple indexes without an
active default require an explicit binding. A missing saved index produces an
error instead of silently querying another database.

The model can choose among four complete skills: `eu4-zh`, `eu4-en`, `hoi4-zh`
and `hoi4-en`. Chinese conversations use Chinese skills; a switch to English
loads the English version. Other languages use English instructions while answers
follow the user's language. UI locale, code, script identifiers and quoted text
do not determine the conversation language. Only the needed translation is
loaded at a time, without requiring an explicit language request or affecting
other chats.

## Background tasks

Engine installation, rule downloads, index creation and refresh return background
tasks. Tasks support queuing, progress and cancellation; the same index name
cannot be changed concurrently. Plugin disposal cancels tasks and waits for child
process cleanup. Restart marks unfinished tasks as `interrupted` rather than
repeating builds automatically.

For model-driven management, check `state` / `list`, track the returned task ID
with `tasks`, and cancel with `cancel_task`. See the
[management reference](management.md) for parameters and results.

## Plugin configuration

Set these fields in DSH plugin configuration. Preserve existing unrelated fields
when editing a profile.

| Field               | Default                   | Meaning                                                                                       |
| ------------------- | ------------------------- | --------------------------------------------------------------------------------------------- |
| `home`              | `~/.dsh/data/eu4-indexer` | Engine, rules, registry, indexes, tasks and chat defaults                                     |
| `executablePath`    | Empty                     | External engine supporting management API 1; takes precedence over the path saved in the UI   |
| `language`          | `auto`                    | Legacy compatibility; `zh` / `en` remain accepted but do not fix the skill language           |
| `concurrency`       | `2`                       | Parallel background tasks, from 1 to 8; changes to the same index are exclusive               |
| `timeoutMs`         | `30000`                   | Short management-request and download timeout in milliseconds; not used for background builds |
| `toolCallTimeoutMs` | `60000`                   | MCP query timeout in milliseconds                                                             |

Use a separate `home` for each independent DSH host. `DSH_HOME` alone does not
override the plugin data path. Isolated tests also need a separate skill directory
and plugin `home`; see [isolated Web validation](../CONTRIBUTING.md#isolated-web-validation).

See [data and installation](architecture.md#data-and-installation) for storage,
old database versions and external-client boundaries.
