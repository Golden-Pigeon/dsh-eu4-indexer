import { mkdir, readFile, writeFile, cp } from 'node:fs/promises'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '..')
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
        ? '\n## DSH 设置与会话\n\n使用 `eu4_indexer_manage` 的 `state` / `list` 检查索引，通过 `bind` 选择当前会话的默认索引。缺少引擎或规则时，在插件页安装引擎并运行 `setup`；通过 `index` 创建索引。耗时操作返回任务 id，使用 `tasks` 查看进度、`cancel_task` 取消。游戏查询使用 `mcp__eu4__` 工具。每个会话都有独立的数据库选择；不得修改其他会话的绑定。不得运行上游 `install` 注册其他客户端。\n'
        : '\n## DSH setup and sessions\n\nUse `eu4_indexer_manage` with `state` / `list` to inspect available indexes and `bind` to set the current session default. Install the engine in the plugin panel, run `setup` for rules, and `index` to build indexes. Long operations return a task id; inspect `tasks` until terminal or cancel with `cancel_task`. Game queries use the `mcp__eu4__` tools. Database selection is isolated per session. Do not alter other sessions or use the upstream `install` command to register other clients.\n'
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
if (process.argv.includes('--bundle-engine')) {
  const manifest = JSON.parse(
    await readFile(path.join(root, 'engine.lock.json'), 'utf8'),
  )
  if (!Object.keys(manifest.assets).length)
    throw new Error('Build at least one self-contained engine before packaging')
  await mkdir(path.join(root, 'resources/archives'), { recursive: true })
  for (const asset of Object.values(manifest.assets))
    await cp(
      path.join(root, 'artifacts', asset.file),
      path.join(root, 'resources/archives', asset.file),
    )
}
