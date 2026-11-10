import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { renderDshSkill } from '../scripts/lib/skill.mjs'
import { Context } from '@deepseek-ai/cordis'
import Skills, {
  isModelInvocable,
  isUserInvocable,
} from '@deepseek-ai/dsh-skill'
import { registerSkills } from '../dist/integration/skills.js'
import { Config } from '../dist/index.js'

test('CRLF upstream skills produce the same DSH instructions as LF for all four translations', async () => {
  const root = path.resolve(import.meta.dirname, '..')
  for (const game of ['eu4', 'hoi4'])
    for (const language of ['en', 'zh']) {
      const source = (
        await readFile(
          path.join(
            root,
            'external/eu4-indexer/skills/eu4-indexer',
            game,
            language,
            'SKILL.md',
          ),
          'utf8',
        )
      ).replaceAll('\r\n', '\n')
      const expected = await readFile(
        path.join(root, 'resources/skills', game, language, 'SKILL.md'),
        'utf8',
      )
      const actual = renderDshSkill(
        source.replaceAll('\n', '\r\n'),
        game,
        language,
      )
      assert.equal(renderDshSkill(source, game, language), expected)
      assert.equal(actual, expected)
      assert.doesNotMatch(actual, /see "Setup" at the end|见文末"设置"|\r/)
      assert.match(actual, /eu4_indexer_tools/)
      assert.match(actual, /engine\.ready/)
    }
})

async function fixture() {
  const ctx = new Context()
  const registry = ctx.plugin(Skills)
  await registry.await()
  const plugin = ctx.plugin({
    name: 'test-bundled-skills',
    inject: ['skills'],
    apply: async (ctx) => {
      await registerSkills(ctx)
    },
  })
  await plugin.await()
  return {
    ctx,
    stop: async () => {
      await plugin.dispose()
      await registry.dispose()
    },
  }
}

test('model catalog offers all four translations while keeping generic user entry points', async () => {
  const f = await fixture()
  try {
    const skills = await f.ctx.get('skills').list()
    assert.deepEqual(
      skills.filter(isModelInvocable).map((skill) => skill.name),
      ['eu4-en', 'eu4-zh', 'hoi4-en', 'hoi4-zh'],
    )
    assert.deepEqual(
      skills.filter(isUserInvocable).map((skill) => skill.name),
      ['eu4', 'eu4-en', 'eu4-zh', 'hoi4', 'hoi4-en', 'hoi4-zh'],
    )
    for (const game of ['eu4', 'hoi4']) {
      const zh = await f.ctx.get('skills').get(`${game}-zh`)
      const en = await f.ctx.get('skills').get(`${game}-en`)
      assert.match(zh.description, /中文对话/)
      assert.match(en.description, /English conversation/)
      assert.match(zh.content, /## 游戏简介/)
      assert.match(en.content, /## About /)
      assert.doesNotMatch(en.content, /## 游戏简介/)
      assert.doesNotMatch(zh.content, /## About /)
      assert.ok(zh.path.endsWith(path.join(game, 'zh', 'SKILL.md')))
      assert.ok(en.path.endsWith(path.join(game, 'en', 'SKILL.md')))
      for (const skill of [zh, en]) {
        assert.ok(skill.content.includes(`${game}-zh`))
        assert.ok(skill.content.includes(`${game}-en`))
        assert.ok(skill.content.includes('eu4_indexer_state'))
        assert.ok(skill.content.includes('eu4_indexer_tools'))
        assert.ok(skill.content.includes('enabled: true'))
        assert.ok(skill.content.includes('enabled: false'))
        assert.ok(!skill.content.includes('install_engine'))
        assert.ok(!skill.content.includes('eu4_indexer_manage'))
        assert.ok(!skill.content.includes('see "Setup" at the end'))
        assert.ok(!skill.content.includes('见文末"设置"'))
        assert.ok(skill.content.includes('engine.ready'))
        assert.ok(
          skill.content.includes('optionalDependencies') ||
            skill.content.includes('optional dependencies'),
        )
      }
      const entry = await f.ctx.get('skills').get(game)
      assert.equal(entry.invocation.modelInvocable, false)
      assert.equal(entry.invocation.userInvocable, true)
      assert.match(entry.content, /do not ask the user to choose/)
      assert.ok(entry.content.includes(`${game}-zh`))
      assert.ok(entry.content.includes(`${game}-en`))
    }
  } finally {
    await f.stop()
  }
})

test('registration failure unwinds earlier skill contributions', async () => {
  let active = 0
  const ctx = {
    skills: {
      register() {
        if (active === 2) throw new Error('Failed registration')
        active++
        let disposed = false
        return () => {
          if (!disposed) {
            active--
            disposed = true
          }
        }
      },
    },
  }
  await assert.rejects(registerSkills(ctx), /Failed registration/)
  assert.equal(active, 0)
})

test('legacy language settings are accepted without choosing a fixed skill translation', () => {
  assert.equal(Config({}).language, 'auto')
  for (const language of ['zh', 'en', 'auto'])
    assert.equal(Config({ language }).language, language)
})
