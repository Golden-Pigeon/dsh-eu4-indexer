import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises'
import path from 'node:path'
import { compile } from './compile.mjs'
import { verifyUpstreamSource } from './lib/upstream-source.mjs'
const root = path.resolve(import.meta.dirname, '..')
const pkg = JSON.parse(await readFile(path.join(root, 'package.json')))
const lock = JSON.parse(await readFile(path.join(root, 'engine.lock.json')))
verifyUpstreamSource(root, lock)
const sdk = JSON.parse(await readFile(path.join(root, 'global.json')))
if (sdk.sdk.version !== lock.build?.sdkVersion)
  throw new Error('global.json SDK does not match engine.lock.json')
await compile()
const { platforms } = await import('../dist/engine/platforms.js')
if (Object.keys(lock.packages).length !== Object.keys(platforms).length)
  throw new Error('Run npm run prepare:engines after changing platforms')
for (const [target, platform] of Object.entries(platforms)) {
  if (
    pkg.optionalDependencies?.[platform.name] !== lock.engineVersion ||
    lock.packages[target]?.version !== lock.engineVersion ||
    lock.packages[target]?.name !== platform.name
  )
    throw new Error(
      `Stale engine dependency ${target}; run npm run prepare:engines`,
    )
}
for (const game of ['eu4', 'hoi4'])
  for (const language of ['en', 'zh']) {
    const source = path.join(
      root,
      'external/eu4-indexer/skills/eu4-indexer',
      game,
      language,
      'SKILL.md',
    )
    let skill = await readFile(source, 'utf8')
    const heading = language === 'zh' ? '## 设置' : '## Setup'
    const at = skill.indexOf(heading)
    if (at >= 0) skill = skill.slice(0, at)
    skill = skill.replace(
      'If the `eu4` tools are not available, tell the user to build an index and register\nthe server (see "Setup" at the end) instead of guessing from training data.',
      'If game query tools are unavailable, use the DSH management tools below to check\nengine readiness, build an index and bind it to the current chat. Do not guess\nfrom training data or register another MCP server.',
    )
    skill = skill.replace(
      '如果 `eu4` 工具不可用，告知用户需要先构建索引并注册服务器（见文末"设置"），',
      '如果游戏查询工具不可用，使用文末的 DSH 管理工具检查引擎、构建索引并绑定当前会话；不要另行注册 MCP 服务器，',
    )
    skill = skill.replace(
      /^(---\r?\n)name: [^\r\n]+/,
      `$1name: ${game}-${language}`,
    )
    const bodyAt = skill.indexOf('\n---', 4) + 4
    const selection =
      language === 'zh'
        ? `\n\n## DSH 技能语言选择\n\n当用户当前用中文交流时，由你自动选择并加载本技能 \`${game}-zh\`。根据对话语境选择，与界面语言及插件旧 language 配置无关，也不需要用户明确指定。脚本标识、路径、代码及引用中的外文不代表用户改变了交流语言。每次只选一种翻译；如果用户改用英文，加载 \`${game}-en\`，以后采用新版本的语言和术语约定。原版本中的语言约定不覆盖用户当前的交流语言。\n`
        : `\n\n## DSH skill language selection\n\nSelect \`${game}-en\` yourself for English conversation, or as the available fallback for languages without a translation. Choose \`${game}-zh\` when the user is conversing in Chinese, regardless of UI language or the legacy plugin language setting; no explicit language request is needed. Code, identifiers, paths and quoted foreign text do not by themselves change conversational language. Load one translation at a time. If the user switches language, load the matching translation and use its language and terminology guidance in place of the previous version. Answer in the user's current language.\n`
    skill = skill.slice(0, bodyAt) + selection + skill.slice(bodyAt)
    skill +=
      language === 'zh'
        ? '\n## DSH 设置与会话\n\n引擎和 EU4/HOI4 游戏规则随插件自动安装和更新。先调用 `eu4_indexer_tools` 并传入 `enabled: true` 加载当前会话的工具，再调用 `eu4_indexer_state` 检查 `engine.ready` 和规则状态，再调用 `eu4_indexer_list` 查看索引。通过 `eu4_indexer_index` 创建索引，`eu4_indexer_refresh` 刷新索引，`eu4_indexer_bind` 选择当前会话的默认索引。构建操作返回任务 id，使用 `eu4_indexer_tasks` 轮询直到终态，失败时报告任务错误；可用 `eu4_indexer_cancel_task` 取消。缺少引擎或规则时，报告具体错误并启用 optionalDependencies 重新安装插件；配置了外部路径时先修正路径。游戏查询使用 `mcp__eu4__` 工具。每个会话的数据库选择互相隔离，不得修改其他会话绑定。转向无关工作时，可用 `eu4_indexer_tools` 的 `enabled: false` 卸载工具；后台任务和默认绑定会保留。宿主重启或恢复聊天后需要再次加载。不得运行上游 `install` 注册其他客户端。\n'
        : '\n## DSH configuration and sessions\n\nThe engine and EU4/HOI4 game rules are installed and updated with the plugin. First call `eu4_indexer_tools` with `enabled: true` to load tools for this chat, then use `eu4_indexer_state` to check `engine.ready` and rules, then `eu4_indexer_list` to inspect indexes. Build with `eu4_indexer_index`, rebuild with `eu4_indexer_refresh`, and select the current chat default with `eu4_indexer_bind`. Builds return a task id; poll `eu4_indexer_tasks` until terminal, report failures, or cancel with `eu4_indexer_cancel_task`. Missing engine or rule files require reinstalling the plugin with optional dependencies enabled; correct configured external paths first. Game queries use `mcp__eu4__` tools. Database selection is isolated per session; do not alter other sessions or use upstream `install` to register other clients. Unload tools with `eu4_indexer_tools` and `enabled: false` when returning to unrelated work; background tasks and saved bindings remain. Load again after a host restart or chat restoration.\n'
    const out = path.join(root, 'resources/skills', game, language)
    await mkdir(out, { recursive: true })
    await writeFile(path.join(out, 'SKILL.md'), skill)
  }
await cp(
  path.join(root, 'external/eu4-indexer/LICENSE'),
  path.join(root, 'resources/UPSTREAM-LICENSE'),
)
await mkdir(path.join(root, 'resources/docs'), { recursive: true })
await cp(
  path.join(root, 'external/eu4-indexer/docs/management.md'),
  path.join(root, 'resources/docs/management.md'),
)
await cp(
  path.join(root, 'external/eu4-indexer/docs/dependencies.md'),
  path.join(root, 'resources/docs/dependencies.md'),
)
console.log('Built four game/language skills from the pinned submodule.')
// Remove obsolete bundles so a previous local build cannot bloat the main npm package.
await rm(path.join(root, 'resources/archives'), {
  recursive: true,
  force: true,
})
await rm(path.join(root, 'resources/engine'), { recursive: true, force: true })
