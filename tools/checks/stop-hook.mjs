import { readFileSync } from 'node:fs'
import {
  alreadyTold,
  changedPaths,
  checkInCheckout,
  forgetTold,
  gitOutput,
  owningCheckout,
  refuseUninstalled,
  routeHook,
  runInCheckout,
  toldFile
} from './route.mjs'

const call = JSON.parse(readFileSync(0, 'utf8') || '{}')
if (process.env.GITHUB_ACTIONS === 'true') process.exit(0)

const route = routeHook(owningCheckout(call.cwd ?? process.cwd()), 'stop-hook.ts')
if (route.kind === 'skip') process.exit(0)

const session = typeof call.session_id === 'string' ? call.session_id : undefined
const told = toldFile(route.checkout, session)
const changed = changedPaths(
  gitOutput(route.checkout, 'diff', '--name-only', '--diff-filter=d', '-z', 'HEAD'),
  gitOutput(route.checkout, 'ls-files', '--others', '--exclude-standard', '-z')
)
if (changed.length === 0) {
  forgetTold(told)
  process.exit(0)
}

const continuingAfterABlock = Boolean(call.stop_hook_active)
if (route.kind === 'install') {
  if (continuingAfterABlock) process.exit(0)
  refuseUninstalled(route.checkout, advice => alreadyTold(told, advice))
}
if (!continuingAfterABlock) runInCheckout(route, session === undefined ? { changed } : { changed, session })

const checkedWithoutTheRecord = checkInCheckout(route, { changed })
if (checkedWithoutTheRecord.status === 0) forgetTold(told)
