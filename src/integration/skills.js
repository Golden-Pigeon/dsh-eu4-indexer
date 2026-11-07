import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { packageRoot } from '../engine/runtime.js'
/** Skills are copied from the pinned source by build, never fetched independently. */
export async function registerSkills(ctx, language) {
  const releases = []
  try {
    for (const game of ['eu4', 'hoi4']) {
      const content = await readFile(
        path.join(
          packageRoot,
          'resources',
          'skills',
          game,
          language,
          'SKILL.md',
        ),
        'utf8',
      )
      const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
      releases.push(
        ctx.skills.register({
          name: game,
          description:
            game === 'eu4'
              ? 'Query EU4 game and mod scripts, explain events and missions, trace conditions, audit modifiers and plan goals using the local index.'
              : 'Query HOI4 game and mod scripts, explain focuses, events and decisions, and trace prerequisites using the local index.',
          content: body,
          source: 'bundled',
          path: path.join(
            packageRoot,
            'resources',
            'skills',
            game,
            language,
            'SKILL.md',
          ),
        }),
      )
    }
  } catch (error) {
    for (const release of releases.reverse()) await release()
    throw error
  }
  return async () => {
    for (const release of releases.reverse()) await release()
  }
}
