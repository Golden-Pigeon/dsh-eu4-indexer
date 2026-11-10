# Management Reference

Only `eu4_indexer_tools` is present in an unrelated chat. Call it with
`{ "enabled": true }` to make the 16 independent management tools available
on the next model request and connect query tools if an index is available.
Each management tool takes only the parameters listed below; no `operation`
wrapper is needed. The UI calls the same service over authenticated DSH RPC
and does not require model-tool activation.

This page describes the plugin interface. For the engine's JSONL protocol and
reusable query-session interface, see the
[upstream management protocol](../resources/docs/management.md). Connection and
concurrency details are in [architecture](architecture.md).

## Loading and unloading

`eu4_indexer_tools` takes one required boolean, `enabled`. Loading returns
`enabled` and `queryConnected`; a connection failure may also include `queryError`.
Management remains enabled if the engine or saved index needs repair. No index
means management is available without query tools; build or bind an index to
connect. Repeating a successful load preserves the live temporary selection.

Call with `{ "enabled": false }` to remove management and query tools from
future requests in this chat. It waits for active queries to finish, closes the
MCP client, and retains saved defaults and background tasks. The loader stays
available. Tool visibility follows the live Agent instance; restored chats and
plugin/host restarts require another load. Other chats are unaffected.

## Tools

All names have the `eu4_indexer_` prefix. `game` defaults to `eu4`.

| Tool                       | Parameters and result                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `eu4_indexer_state`        | Engine readiness, registry, environment, tasks, bindings and chat list                                                  |
| `eu4_indexer_capabilities` | Engine/schema/API versions, games and supported operations                                                              |
| `eu4_indexer_status`       | Game environments and bundled or overridden rule paths                                                                  |
| `eu4_indexer_list`         | Registered indexes and the registry default                                                                             |
| `eu4_indexer_detect`       | Optional `game`, `gameDir`, `mods[]`, `workshopIds[]`, `playset`, `autoMods`; preview resolved source order             |
| `eu4_indexer_workshop`     | Optional `game`; installed Workshop items                                                                               |
| `eu4_indexer_playsets`     | Optional `game`; launcher playsets and ordered mods                                                                     |
| `eu4_indexer_inspect`      | `name` or `path`; optional `errorOffset`, `errorLimit` (1–1000); paginated parse errors                                 |
| `eu4_indexer_index`        | `name`; optional game/discovery fields, `configDir`, `languages[]`, `skipGeneric`, `noFts`, `setActive`; returns a task |
| `eu4_indexer_refresh`      | `name`; optional `game`; rebuild from saved inputs; returns a task                                                      |
| `eu4_indexer_register`     | `name`, `path`; optional `setActive`; validate and import a compatible database                                         |
| `eu4_indexer_remove`       | `name`; optional `deleteFile`; rejects in-use indexes and ongoing builds                                                |
| `eu4_indexer_bind`         | `name`; bind the current chat to an index                                                                               |
| `eu4_indexer_unbind`       | Clear the current chat's binding and close its query connection                                                         |
| `eu4_indexer_tasks`        | Recorded tasks, progress, results and errors                                                                            |
| `eu4_indexer_cancel_task`  | `taskId`; request cancellation and return task state                                                                    |

The engine and both games' rules are installed and updated with the plugin.
The old `eu4_indexer_manage`, `install_engine` and `setup` interfaces are removed.
`configure` remains UI-only: `executablePath` selects a probed compatible external
engine; clearing it returns to the packaged dependency.

## Examples

After loading with `eu4_indexer_tools`, call `eu4_indexer_list` with `{}`, then `eu4_indexer_bind` with
`{ "name": "vanilla" }`. Model tools always use the current chat ID and do not
accept `sessionId`. The management UI can select a chat explicitly.

To build an index, call `eu4_indexer_index` with:

```json
{ "game": "eu4", "name": "vanilla", "gameDir": "/games/EU4" }
```

Poll `eu4_indexer_tasks` with `{}` until the task is terminal. To cancel, call
`eu4_indexer_cancel_task` with `{ "taskId": "<returned-task-id>" }`.

Task states are `queued`, `running`, `cancelling`, `succeeded`, `failed`,
`cancelled` or `interrupted`. Successful output is in `result`; failures have
`error` and `code`. Keep polling after requesting cancellation until the task
finishes.

## Selection and removal

`bind` saves the chat default. `unbind` clears it and stops the query connection.
MCP's `select_database` changes only the current connection's temporary selection.
Rebuilds and reconnections restore the persistent default. See
[chats and skills](usage.md#chats-and-skills) for selection rules.

`register` can replace a registered path under the same name. On success it waits
for affected chats to reconnect; other chats keep their connections. Import is
rejected while that index name is being built. `remove` checks persistent
bindings and actual selections inside the query coordinator, and refuses removal
if reading a selection fails. It never deletes files outside the managed
database directory.

## UI transport

The production UI sends Connection RPC envelopes through a separate Connection
Fetch route at `/api/eu4-indexer/dispatch`, using DSH authentication and owner
access checks. It does not claim the Gateway's `/api` interceptor. Tool examples above show model-facing calls; the UI uses operation-based RPC
envelopes internally. The plugin
does not start a separate public management service.
