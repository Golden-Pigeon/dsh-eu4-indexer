# 架构与管理操作

DSH 适配层不重新实现解析器、数据库模型或游戏查询。submodule 的 `manage` 将 Discovery、Setup、Pipeline、IndexInputs 和 Registry 暴露为版本化 JSONL；`serve` 继续提供上游全部查询工具。通用接口详情见 [上游协议](../resources/docs/management.md)。

`IndexerService` 是界面和模型工具共享的入口。短操作转发到引擎，耗时操作进入 `Tasks`。同名索引不允许同时变更，规则更新与构建互斥，引擎切换等待后台任务结束。任务日志有界保存；原始进度保留在内存，终态及结果落盘。卸载取消并等待子进程退出；下次启动将未完成记录标为 interrupted，不自动重复构建。

## 操作

| 操作 | 参数 |
| --- | --- |
| `state` / `tasks` | 插件状态及任务列表 |
| `capabilities` / `status` / `list` | 上游能力、环境、注册表 |
| `detect` | `game`, 可选 `gameDir`, `mods[]`, `workshopIds[]`, `playset`, `autoMods` |
| `workshop` / `playsets` | `game` |
| `index` | `name`, `game`, 上述发现参数，`configDir`, `languages[]`, `skipGeneric`, `noFts` |
| `refresh` | `name`, `game`；实际重建参数取自数据库中保存的原始输入 |
| `setup` | `game`；后台下载规则 |
| `register` | `name`, `path`, 可选 `setActive` |
| `inspect` | `name` 或 `path`, 可选 `errorOffset`, `errorLimit`（1–1000） |
| `remove` | `name`, 可选 `deleteFile`；已绑定和正在构建的索引会拒绝 |
| `bind` / `unbind` | 界面提供 `sessionId`；模型调用使用执行它的聊天 id。`bind` 另需 `name` |
| `cancel_task` | `taskId` |
| `install_engine` | 使用本机锁定产物；后台校验、安装与重连 |
| `configure` | 仅界面使用的 `executablePath`，探测兼容性后保存 |

## 会话

每个 `agent.ctx` 挂载一个官方 `@deepseek-ai/dsh-mcp-client`，serverName 都是 `eu4`，由 DSH scope 隔离工具注册。进程以 `serve --db <path> --query-session <agent.id>` 启动。切换聊天默认索引会清理旧连接，再创建新连接；失败恢复旧连接。任务完成仅刷新使用该索引的聊天；引擎替换先清理客户端再重连。已关闭聊天的默认仍可在界面解除。

默认绑定与运行期 `select_database` 分工：前者持久保存，后者只改变当前 MCP 查询会话，在该进程退出后消失。重建或重连恢复持久默认。没有持久默认时，使用注册表 activeDb，或唯一索引；多个索引且没有默认时，等待明确绑定。不存在的已保存选择报错，避免静默改查别的数据。

上游也支持在同一 MCP 连接的每次 `tools/call` 中使用 `_meta["eu4indexer/sessionId"]`。各 id 的选择独立于连接默认及其他 id。省略它并且没有 `--query-session` 时，保留原客户端行为。`close_query_session` 释放命名会话，连接关闭释放全部状态。会话 id 负责状态隔离，身份权限仍由宿主控制。

## 数据与安装

`home` 下的 `config.json` 是上游注册表，`db/<game>/` 保存不可变版本，`config/<game>/` 保存规则；`sessions.json`、`tasks.json`、`settings.json` 是插件数据。重建失败不覆盖原数据库。发布成功后仍保留旧版本，供已有读者继续使用；它们不会自动清理。强制终止可能留下未注册的 `.building` 文件，只能在确认没有构建进程后清理。导入外部数据库默认只注册；插件拒绝删除管理目录之外的文件。

引擎归档固定 SHA-256，先验证路径、拒绝链接、完整解包，再探测 API。激活失败回滚上一版本。包中有对应归档时不需要联网；规则下载仍需要网络。外部引擎由用户自行更新。Windows 提取使用系统 PowerShell，Unix 使用 tar；本机测试不等于其他五种平台已执行过测试。

多个独立 DSH 宿主应各用独立 `home`，避免共享任务 journal 和会话默认。上游注册表的读改写有进程间锁与原子替换，但它不替应用协调同名构建。移除或手工清理文件前也需考虑插件外的 MCP 读者；插件无法枚举外部客户端。

生产 UI 只通过 DSH `/api` RPC 的 `eu4-indexer/dispatch` 处理器访问管理功能，并检查 owner principal。命令与参数以 argv 和 JSON 传递，不拼 shell 命令。管理子进程和官方 MCP 客户端均清理宿主凭据环境。该插件按授权管理本机文件、下载规则及引擎，不开放独立公网管理端点。
