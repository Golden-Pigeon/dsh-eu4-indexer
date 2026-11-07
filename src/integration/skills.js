import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { packageRoot } from '../engine/runtime.js'

const games = {
  eu4: {
    en: 'EU4 events, missions, decisions, conditions, modifiers, localisation and game goals.',
    zh: '查询 EU4 事件、任务、决议、条件、修正、本地化，追溯关系并规划游戏目标。',
  },
  hoi4: {
    en: 'HOI4 focus trees, events, decisions, ideas, doctrines, modifiers, conditions, localisation and game goals.',
    zh: '查询 HOI4 国策树、事件、决议、理念、学说、修正、条件、本地化，追溯前置关系并规划游戏目标。',
  },
}

/** The model selects translations; no code inspects or classifies user messages. */
export async function registerSkills(ctx) {
  const definitions = []
  for (const [game, descriptions] of Object.entries(games)) {
    for (const language of ['zh', 'en']) {
      const file = path.join(
        packageRoot,
        'resources',
        'skills',
        game,
        language,
        'SKILL.md',
      )
      const content = await readFile(file, 'utf8')
      definitions.push({
        name: `${game}-${language}`,
        description:
          language === 'zh'
            ? `${descriptions.zh} 中文对话使用本版本；按用户当前的交流语言自动选择，与界面或插件语言设置无关。只加载一种翻译；对话改用英文时加载 ${game}-en。`
            : `${descriptions.en} English instructions: choose this version for English conversation, or as fallback for other unsupported languages. For Chinese conversation choose ${game}-zh. Use one translation at a time, based on the user's language rather than UI or plugin settings.`,
        content: content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''),
        source: 'bundled',
        path: file,
      })
    }
    // Preserve /eu4 and /hoi4 user invocations without redundant model catalog entries.
    definitions.push({
      name: game,
      description: `${game.toUpperCase()} language-neutral entry. Automatically load the translation matching the user's conversation.`,
      invocation: { modelInvocable: false, userInvocable: true },
      source: 'bundled',
      content: `# ${game.toUpperCase()} skill\n\nChoose and load the full instructions using the skill tool before answering game questions:\n\n- Chinese conversation: load \`${game}-zh\`.\n- English conversation: load \`${game}-en\`.\n- Other languages: use \`${game}-en\` as the available fallback and answer in the user's language.\n\nMake this choice yourself from the current user's conversation; do not ask the user to choose a skill language. UI and plugin language settings do not determine the choice. Code, script identifiers, file paths and quoted game text do not by themselves change the conversation language. Load one translation, not both. When the user changes conversational language, load the matching version; its language and terminology guidance supersedes the previously loaded translation.\n\nUse \`eu4_indexer_manage\` for engine and index management; game queries use \`mcp__eu4__\` tools after loading the selected full skill.\n`,
    })
  }
  const releases = []
  try {
    for (const definition of definitions)
      releases.push(ctx.skills.register(definition))
  } catch (error) {
    for (const release of releases.reverse()) await release()
    throw error
  }
  let disposed = false
  return async () => {
    if (disposed) return
    disposed = true
    for (const release of releases.reverse()) await release()
  }
}
