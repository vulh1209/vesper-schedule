import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import matter from 'gray-matter'
import { SkillFrontmatterSchema, type SkillFrontmatter } from '../core/schemas.js'
import { PATHS, repoSkillsPath } from '../core/paths.js'
import { type Result, ok, err, type SkillSource } from '../core/types.js'

export interface LoadedSkill {
  slug: string
  metadata: SkillFrontmatter
  content: string
  path: string
  source: SkillSource
}

function loadSkillsFromDir(dir: string, source: SkillSource): LoadedSkill[] {
  if (!existsSync(dir)) return []

  const files = readdirSync(dir).filter(f => f.endsWith('.md'))
  const skills: LoadedSkill[] = []

  for (const file of files) {
    const filePath = join(dir, file)
    try {
      const raw = readFileSync(filePath, 'utf-8')
      const { data, content } = matter(raw)
      const metadata = SkillFrontmatterSchema.parse(data)
      const slug = basename(file, '.md')
      skills.push({ slug, metadata, content: content.trim(), path: filePath, source })
    } catch {
      // Skip invalid skill files silently
    }
  }

  return skills
}

/** Builtin skills directory (relative to package root) */
function builtinSkillsDir(): string {
  // Resolve relative to this file → src/skills/loader.ts → ../../skills/
  return join(import.meta.dir, '..', '..', 'skills')
}

/**
 * Load all skills with precedence: repo > global > builtin.
 * Later sources override earlier ones by slug.
 */
export function loadAllSkills(repoPath?: string): Result<LoadedSkill[]> {
  try {
    const builtinDir = builtinSkillsDir()
    const globalDir = PATHS.skills
    const repoDir = repoPath ? repoSkillsPath(repoPath) : undefined

    const builtin = loadSkillsFromDir(builtinDir, 'builtin')
    const global = loadSkillsFromDir(globalDir, 'global')
    const repo = repoDir ? loadSkillsFromDir(repoDir, 'repo') : []

    // Merge with precedence: repo > global > builtin
    const skillMap = new Map<string, LoadedSkill>()
    for (const skill of [...builtin, ...global, ...repo]) {
      skillMap.set(skill.slug, skill)
    }

    return ok(Array.from(skillMap.values()))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return err(`Failed to load skills: ${message}`)
  }
}

/** Load a single skill by slug */
export function loadSkill(slug: string, repoPath?: string): Result<LoadedSkill> {
  const allResult = loadAllSkills(repoPath)
  if (!allResult.ok) return allResult
  const skill = allResult.value.find(s => s.slug === slug)
  if (!skill) return err(`Skill not found: "${slug}"`)
  return ok(skill)
}
