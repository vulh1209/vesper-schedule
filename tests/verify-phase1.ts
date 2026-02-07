import { loadAllSkills, loadSkill } from '../src/skills/loader.js'
import { loadConfig } from '../src/core/config.js'

let pass = 0
let fail = 0

function check(name: string, condition: boolean) {
  if (condition) {
    console.log(`  PASS: ${name}`)
    pass++
  } else {
    console.log(`  FAIL: ${name}`)
    fail++
  }
}

console.log('=== Phase 1 Success Criteria ===\n')

// 1. Skills list
const allSkills = loadAllSkills()
check('loadAllSkills succeeds', allSkills.ok)
if (allSkills.ok) {
  check('7 built-in skills loaded', allSkills.value.length === 7)
  const slugs = allSkills.value.map(s => s.slug).sort()
  check('Expected slugs present', slugs.includes('issue-triage') && slugs.includes('pr-review') && slugs.includes('repo-monitor'))
}

// 2. Skill frontmatter parsing
const skill = loadSkill('issue-triage')
check('loadSkill succeeds', skill.ok)
if (skill.ok) {
  check('name field parsed', skill.value.metadata.name === 'issue-triage')
  check('params parsed', skill.value.metadata.params.length === 3)
  check('allowedTools parsed', skill.value.metadata.allowedTools.length === 2)
  check('output target parsed', skill.value.metadata.output.target === 'github-issue-comment')
  check('source is builtin', skill.value.source === 'builtin')
}

// 3. Config loading
const config = loadConfig()
check('loadConfig succeeds', config.ok)
if (config.ok) {
  check('daemon defaults applied', config.value.daemon.log_level === 'info')
  check('queue size default', config.value.daemon.max_queue_size === 50)
  check('repl language default', config.value.repl.language === 'en')
}

console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`)
process.exit(fail > 0 ? 1 : 0)
