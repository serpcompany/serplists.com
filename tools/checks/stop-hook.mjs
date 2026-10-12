import { readFileSync } from 'node:fs'
import {
  alreadyTold,
  changedPaths,
  gitOutput,
  owningCheckout,
  refuseUninstalled,
  routeHook,
  runInCheckout,
  toldFile
} from './route.mjs'

const call = JSON.parse(readFileSync(0, 'utf8') || '{}')
if (call.stop_hook_active || process.env.GITHUB_ACTIONS === 'true') process.exit(0)

const route = routeHook(owningCheckout(call.cwd ?? process.cwd()), 'stop-hook.ts')
if (route.kind === 'skip') process.exit(0)

const changed = changedPaths(
  gitOutput(route.checkout, 'diff', '--name-only', '--diff-filter=d', '-z', 'HEAD'),
  gitOutput(route.checkout, 'ls-files', '--others', '--exclude-standard', '-z')
)
if (changed.length === 0) process.exit(0)

const session = typeof call.session_id === 'string' ? call.session_id : undefined
if (route.kind === 'install') {
  refuseUninstalled(route.checkout, advice => alreadyTold(toldFile(route.checkout, session), advice))
}
runInCheckout(route, session === undefined ? { changed } : { changed, session })
