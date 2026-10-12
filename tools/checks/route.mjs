import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const SESSION_NAME = /^[A-Za-z0-9_-]{1,128}$/
const GIT_LOCATION = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_COMMON_DIR',
  'GIT_PREFIX',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES'
]
const MANY_FILES = 64 * 1024 * 1024

export const withoutGitLocation = environment =>
  Object.fromEntries(Object.entries(environment).filter(([name]) => !GIT_LOCATION.includes(name)))

const git = (folder, args) =>
  spawnSync('git', args, {
    cwd: folder,
    encoding: 'utf8',
    env: withoutGitLocation(process.env),
    maxBuffer: MANY_FILES
  })

export const gitOutput = (folder, ...args) => git(folder, args).stdout ?? ''

export function owningCheckout(folder) {
  const found = git(folder, ['rev-parse', '--show-toplevel'])
  const checkout = found.status === 0 ? (found.stdout ?? '').trim() : ''
  return checkout || undefined
}

export const ignoredByGit = (file, folder) => git(folder, ['check-ignore', '--quiet', file]).status === 0

export function routeHook(checkout, script, has = existsSync) {
  if (!checkout) return { kind: 'skip' }
  const checks = join(checkout, 'scripts', 'checks', script)
  if (!has(checks)) return { kind: 'skip' }
  if (!has(join(checkout, 'node_modules', 'tsx', 'package.json'))) return { kind: 'install', checkout }
  return { kind: 'run', checkout, script: checks }
}

export const installAdvice = checkout =>
  `The checks can't run in ${checkout}: its packages aren't installed. Run pnpm install there, then make this change again (docs/agents/code.md, Checks).`

export function refuseUninstalled(checkout, told = () => false) {
  const advice = installAdvice(checkout)
  if (process.env.GITHUB_ACTIONS === 'true' || told(advice)) process.exit(0)
  process.stderr.write(`${advice}\n`)
  process.exit(2)
}

export function runInCheckout(route, input) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', route.script], {
    cwd: route.checkout,
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: withoutGitLocation(process.env),
    maxBuffer: MANY_FILES
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

export function changedPaths(...listings) {
  const paths = new Set()
  for (const listing of listings) {
    for (const path of listing.split('\0')) if (path) paths.add(path)
  }
  return [...paths].sort()
}

export function toldFile(checkout, session) {
  if (!session || !SESSION_NAME.test(session)) return undefined
  return join(checkout, 'tmp', 'agent', 'stop-hook', `${session}.txt`)
}

export function alreadyTold(file, report) {
  if (!file) return false
  const key = createHash('sha256').update(report).digest('hex')
  if (existsSync(file) && readFileSync(file, 'utf8') === key) return true
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, key)
  return false
}
