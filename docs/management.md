# Management Reference

The model uses `eu4_indexer_manage` to manage engines, rules, indexes and the
current chat's binding. The UI calls the same service over authenticated DSH RPC.
All operations below use the `operation` field.

This page describes the plugin interface. For the engine's JSONL protocol and
reusable query-session interface, see the
[upstream management protocol](../resources/docs/management.md). Connection and
concurrency details are in [architecture](architecture.md).

## Operations

| Operation                          | Parameters and result                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `state`                            | Engine state, registry, environment, tasks, bindings and chat list                                                                             |
| `tasks`                            | Recorded tasks                                                                                                                                 |
| `capabilities` / `status` / `list` | Upstream capabilities, environment or registry                                                                                                 |
| `detect`                           | `game`; optional `gameDir`, `mods[]`, `workshopIds[]`, `playset`, `autoMods`; preview the resolved source order                                |
| `workshop` / `playsets`            | `game`; installed Workshop items or launcher playsets                                                                                          |
| `index`                            | `name`, `game`, discovery parameters, `configDir`, `languages[]`, `skipGeneric`, `noFts`; returns a task                                       |
| `refresh`                          | `name`, `game`; rebuild from the database's saved original inputs; returns a task                                                              |
| `setup`                            | `game`; download rules; returns a task                                                                                                         |
| `register`                         | `name`, `path`; optional `setActive`; validate and import an existing database                                                                 |
| `inspect`                          | `name` or `path`; optional `errorOffset`, `errorLimit` (1–1000); paginated parse errors with `hasMoreErrors`                                   |
| `remove`                           | `name`; optional `deleteFile`; rejects in-use indexes and indexes being built                                                                  |
| `bind` / `unbind`                  | The UI provides `sessionId`; model calls use the current chat ID. `bind` also requires `name`                                                  |
| `cancel_task`                      | `taskId`; request cancellation and return task state                                                                                           |
| `install_engine`                   | Install and verify the pinned local platform engine, then reconnect; returns a task                                                            |
| `configure`                        | UI only: `executablePath`; nonempty paths are probed first. Clearing the path is allowed when the managed engine is missing or needs an update |

## Examples

List available indexes, then bind the current chat:

```json
{ "operation": "list" }
```

```json
{ "operation": "bind", "name": "vanilla" }
```

Model calls do not need `sessionId` and cannot use it to change other chats. The
management UI specifies the chat ID explicitly.

Background operations return a task. Poll for its terminal state:

```json
{
  "operation": "index",
  "game": "eu4",
  "name": "vanilla",
  "gameDir": "/games/EU4"
}
```

```json
{ "operation": "tasks" }
```

To cancel, use the task's returned `id`:

```json
{ "operation": "cancel_task", "taskId": "<returned-task-id>" }
```

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
access checks. It does not claim the Gateway's `/api` interceptor. The JSON
examples above are tool arguments, not complete HTTP RPC envelopes. The plugin
does not start a separate public management service.
