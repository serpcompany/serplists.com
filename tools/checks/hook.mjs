import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { ignoredByGit, owningCheckout, refuseUninstalled, routeHook, runInCheckout } from './route.mjs'

const call = JSON.parse(readFileSync(0, 'utf8') || '{}')
const edited = call.tool_input?.file_path
if (typeof edited !== 'string' || !edited) process.exit(0)

const file = isAbsolute(edited) ? edited : resolve(call.cwd ?? process.cwd(), edited)
if (!existsSync(file)) process.exit(0)
const folder = dirname(file)
if (ignoredByGit(file, folder)) process.exit(0)

const route = routeHook(owningCheckout(folder), 'hook.ts')
if (route.kind === 'skip') process.exit(0)
if (route.kind === 'install') refuseUninstalled(route.checkout)
runInCheckout(route, { file })
