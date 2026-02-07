import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadAllSkills, loadSkill } from '../../../src/skills/loader.js'

describe('loadAllSkills', () => {
  test('loads all 7 built-in skills', () => {
    const result = loadAllSkills()
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.length).toBe(7)
    const slugs = result.value.map(s => s.slug).sort()
    expect(slugs).toEqual([
      'feature-plan',
      'fix-analysis',
      'issue-triage',
      'plan-review',
      'pr-review',
      'release-notes',
      'repo-monitor',
    ])
  })

  test('all built-in skills have source "builtin"', () => {
    const result = loadAllSkills()
    expect(result.ok).toBe(true)
    if (!result.ok) return

    for (const skill of result.value) {
      expect(skill.source).toBe('builtin')
    }
  })

  test('all skills have valid metadata', () => {
    const result = loadAllSkills()
    expect(result.ok).toBe(true)
    if (!result.ok) return

    for (const skill of result.value) {
      expect(skill.metadata.name).toBeTruthy()
      expect(skill.metadata.description).toBeTruthy()
      expect(skill.metadata.output.target).toBeTruthy()
      expect(skill.slug).toBeTruthy()
      expect(skill.content).toBeTruthy()
    }
  })

  test('all skills have allowedTools', () => {
    const result = loadAllSkills()
    expect(result.ok).toBe(true)
    if (!result.ok) return

    for (const skill of result.value) {
      expect(Array.isArray(skill.metadata.allowedTools)).toBe(true)
      expect(skill.metadata.allowedTools.length).toBeGreaterThan(0)
    }
  })

  test('issue-triage skill has required params', () => {
    const result = loadAllSkills()
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const triage = result.value.find(s => s.slug === 'issue-triage')
    expect(triage).toBeTruthy()
    expect(triage!.metadata.params.find(p => p.name === 'repo')).toBeTruthy()
    expect(triage!.metadata.output.target).toBe('github-issue-comment')
  })
})

describe('loadAllSkills with repo override', () => {
  const testDir = join(tmpdir(), `vesper-test-skills-${Date.now()}`)
  const repoSkillsDir = join(testDir, '.vesper-schedule', 'skills')

  beforeEach(() => {
    mkdirSync(repoSkillsDir, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true })
    }
  })

  test('repo skill overrides builtin with same slug', () => {
    const skillContent = `---
name: issue-triage
description: Custom repo triage
output:
  target: github-issue-comment
---

Custom triage instructions here.`

    writeFileSync(join(repoSkillsDir, 'issue-triage.md'), skillContent)

    const result = loadAllSkills(testDir)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const triage = result.value.find(s => s.slug === 'issue-triage')
    expect(triage).toBeTruthy()
    expect(triage!.source).toBe('repo')
    expect(triage!.metadata.description).toBe('Custom repo triage')
  })

  test('repo adds new skills alongside builtins', () => {
    const skillContent = `---
name: custom-skill
description: My custom skill
output:
  target: github-issue-comment
---

Do something custom.`

    writeFileSync(join(repoSkillsDir, 'custom-skill.md'), skillContent)

    const result = loadAllSkills(testDir)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // 7 builtins + 1 custom
    expect(result.value.length).toBe(8)
    const custom = result.value.find(s => s.slug === 'custom-skill')
    expect(custom).toBeTruthy()
    expect(custom!.source).toBe('repo')
  })

  test('invalid skill files are silently skipped', () => {
    writeFileSync(join(repoSkillsDir, 'bad-skill.md'), 'no frontmatter here')

    const result = loadAllSkills(testDir)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Only 7 builtins, bad skill skipped
    expect(result.value.length).toBe(7)
  })
})

describe('loadSkill', () => {
  test('loads a single skill by slug', () => {
    const result = loadSkill('issue-triage')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.slug).toBe('issue-triage')
    expect(result.value.metadata.name).toBeTruthy()
  })

  test('returns error for nonexistent skill', () => {
    const result = loadSkill('nonexistent-skill')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('not found')
    }
  })
})
