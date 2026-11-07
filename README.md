# DSH EU4 Indexer

在 DeepSeek Harness 中管理和查询 **Europa Universalis IV / Hearts of Iron IV** 的游戏与模组脚本。解析、数据库和查询工具复用 `external/eu4-indexer` submodule；本仓库负责 DSH 生命周期、界面、后台任务和会话默认索引。

- 检查或安装引擎，下载规则，检测游戏，读取 Workshop 与启动器模组集，按顺序组合模组。
- 创建、刷新、导入、检查、移除索引；查看带文件路径、行列号的解析错误并翻页。
- 持久化任务进度与结果，排队、取消；重启将未完成任务标为中断。重建发布独立数据库，失败保留原索引。
- 各聊天独立选择和解绑数据库，默认选择持久化；每个已加载聊天拥有独立的官方 DSH MCP 客户端，工具名保持 `mcp__eu4__…`。
- 内置由同一 submodule 生成的 EU4/HOI4 中英文技能，由模型按当前对话语言选择，随插件加载和卸载；不写入其他代理的配置。
- Web/桌面通过 DSH 自带认证 RPC 管理，限定 owner；无浏览器连接服务的宿主仍可使用管理工具与 MCP 查询。

## 本地开发与使用

需要 Node.js 24+、DSH `0.2.2-rc.1`（小于 `0.3.0`），构建引擎另需 .NET 9 SDK。

```sh
git submodule update --init --recursive
npm ci
npm run build
npm run check
npm run test:upstream
# 上游源码须先在本地提交，保证引擎锁对应实际源码
npm run build:engine -- osx-arm64
npm run test:integration
npm pack --pack-destination artifacts
node scripts/verify-package.mjs
```

`build:engine` 支持 `osx-arm64`、`osx-x64`、`linux-arm64`、`linux-x64`、`win-arm64`、`win-x64`，默认构建本机。打包完整 self-contained `bin/`，不要求最终用户安装 .NET。`engine.lock.json` 记录源码提交与 SHA-256；`npm pack` 将已构建的归档放入 npm 包，可离线安装。没有上传发布产物时，锁中的远程下载地址仅供后续发布使用，插件优先使用包内或本地产物。

本地 npm 包生成后，将其装入使用中的 DSH profile：

```sh
dsh plugin --profile web add /absolute/path/dsh-eu4-indexer-0.1.0.tgz
```

也可在 DSH 插件管理中安装本地包。打开插件配置页“游戏脚本索引”，检查引擎、下载规则、选择游戏与模组、创建索引，再为聊天绑定索引。已有兼容引擎可以通过“引擎与设置”的外部路径接入。更改 profile 的配置时应保留自己已有的其他字段。

插件配置项：

| 字段 | 默认值 | 含义 |
| --- | --- | --- |
| `home` | `~/.dsh/data/eu4-indexer` | 本插件的引擎、规则、注册表、索引和任务数据 |
| `executablePath` | 空 | 可选外部引擎，须支持管理 API 1；设置后优先于界面保存的路径 |
| `language` | `auto` | 仅兼容旧配置；`zh` / `en` 仍可读取，但不再固定技能语言，由模型按对话语境选择 |
| `concurrency` | `2` | 并行后台任务数量，范围 1–8；同名索引互斥 |
| `timeoutMs` | `30000` | 短管理请求与下载的超时（毫秒）；后台构建可取消，不使用此短超时 |
| `toolCallTimeoutMs` | `60000` | MCP 查询调用超时（毫秒） |

终端/模型使用 `eu4_indexer_manage`：先 `state` / `list`，再 `bind` 选择当前聊天默认索引。`index`、`refresh`、`setup`、`install_engine` 返回任务 id，用 `tasks` 查询，用 `cancel_task` 取消。`unbind` 停止当前聊天的查询连接。完整操作和参数见 [管理协议](docs/architecture.md)。

## 代码组织

```text
external/eu4-indexer/     上游 Git submodule；通用管理 API 与查询会话隔离在这里
src/engine/               引擎定位、JSONL 进程、校验与安装回滚
src/indexing/             持久化任务、队列、取消和重启恢复
src/integration/          每会话官方 MCP 客户端、技能、预览 HTTP 适配
src/client/               DSH 插槽界面与中英文文本
src/service.js            管理操作、会话默认、跨任务约束
src/index.js              Cordis 插件与认证 RPC、管理工具入口
resources/skills/         从固定上游源码生成的技能
scripts/                  构建、打包、检查和本地预览
```

升级上游时先更新 submodule，重新构建技能与引擎，运行两边回归，再更新 lock；不要只替换可执行文件。游戏、规则和用户数据库不会打入 npm 包。当前上游增强在本地分支，推送前新机器无法仅从远程取得尚未发布的 submodule 提交。

## 验证

`npm run check` 做语法检查、技能生成和单元/UI 交互测试；`npm run test:integration` 使用真实引擎、官方 Cordis/MCP 客户端及 EU4/HOI4 合成游戏。先构建上游，准备两种游戏的 CWTools 规则；默认规则路径为 `~/.eu4indexer/config/{eu4,hoi4}`，可通过 `EU4_CONFIG_DIR`、`HOI4_CONFIG_DIR` 指定。设置 `DSH_EU4_ENGINE` 可验证发布后的 self-contained 引擎。

```sh
npm run preview
```

预览只监听 `127.0.0.1:3219`，默认数据放在系统临时目录。`DSH_EU4_PREVIEW_HOME`、`DSH_EU4_PREVIEW_PORT`、`DSH_EU4_ENGINE` 可覆盖位置、端口与引擎。生产插件使用 DSH 认证连接，不启动预览 HTTP 服务。

更详细的会话边界、数据生命周期和限制见 [架构说明](docs/architecture.md)。许可证为 MIT，上游许可证随包保存于 `resources/UPSTREAM-LICENSE`。

技能目录向模型提供 `eu4-zh`、`eu4-en`、`hoi4-zh`、`hoi4-en`。用户说中文时模型直接加载中文版本，无需明确指定语言；对话改用英文时加载英文版本。界面语言、代码和脚本标识不决定交流语言。每个游戏只加载当前需要的一个翻译。`/eu4`、`/hoi4` 保留为用户入口，交给模型选择对应完整技能；其他语言使用英文指引并按用户语言回答。插件不分析用户消息，也不维护全局语言开关。
