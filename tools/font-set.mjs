#!/usr/bin/env node
/**
 * Flips the font switch.
 *
 *   npm run font:set arabic.content=noto-naskh-arabic
 *   npm run font:set arabic.wordmark=reem-kufi
 *   npm run font:set                                   (shows what is active)
 *
 * Validates the choice against the catalogue, vendors the files if they are not
 * already here, rebuilds the tokens, and tells you what to rebuild next. The
 * point of a single switch is that nobody has to know which files reference a
 * font — because none of them name one.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { p } from './lib/paths.mjs'

const file = p('brand/tokens/type.json')
const type = JSON.parse(readFileSync(file, 'utf8'))
const arg = process.argv.slice(2).find((a) => a.includes('='))

if (!arg) {
  console.log('\n  active faces\n')
  for (const [script, roles] of Object.entries(type.active)) {
    if (script.startsWith('$')) continue
    for (const [role, key] of Object.entries(roles)) {
      if (role.startsWith('$')) continue
      const shown = type.catalog[key] ? type.catalog[key].family : `${type.catalog[roles[key]]?.family ?? key}  (follows ${key})`
      console.log(`    ${script}.${role.padEnd(9)} ${shown}`)
    }
  }
  console.log('\n  alternatives\n')
  for (const [key, f] of Object.entries(type.catalog)) {
    if (key.startsWith('$')) continue
    console.log(`    ${key.padEnd(22)} ${f.scripts.join('+').padEnd(13)} ${f.roles.join(', ')}`)
  }
  console.log('\n  switch with:  npm run font:set arabic.content=noto-naskh-arabic')
  console.log('  or point a role at another:  npm run font:set arabic.motto=content\n')
  process.exit(0)
}

const [path, key] = arg.split('=')
const [script, role] = path.split('.')

if (!type.active[script]) exit(`"${script}" is not a script. Use: ${Object.keys(type.active).filter((k) => !k.startsWith('$')).join(', ')}`)
if (!(role in type.active[script])) exit(`"${role}" is not a role. Use: ${Object.keys(type.active[script]).join(', ')}`)

const was = type.active[script][role]
const describe = (v) => (type.catalog[v] ? type.catalog[v].family : `same as ${v}`)

// A value may name another ROLE on the same script, which makes it an alias.
// That is how the motto follows the content face without becoming a third face.
const isAlias = !type.catalog[key] && key in type.active[script] && !key.startsWith('$')

if (isAlias) {
  if (key === role) exit(`"${role}" cannot follow itself.`)
} else {
  const face = type.catalog[key]
  if (!face) {
    exit(`"${key}" is neither a catalogue face nor a role on ${script}.\n` +
         `    faces: ${Object.keys(type.catalog).filter((k) => !k.startsWith('$')).join(', ')}\n` +
         `    roles: ${Object.keys(type.active[script]).filter((k) => !k.startsWith('$')).join(', ')}`)
  }
  if (!face.scripts.includes(script)) exit(`${face.family} does not set ${script}.`)
  // A motto is set text on a curve, so it wants a face cleared for content.
  const need = role === 'motto' ? 'content' : role
  if (!face.roles.includes(need)) exit(`${face.family} is not cleared as a ${need} face. Its roles are: ${face.roles.join(', ')}.`)

  // The wordmark and content faces must differ; one face doing both jobs is how
  // a document starts looking like a logo. Other roles are free to reuse either.
  const other = role === 'wordmark' ? 'content' : role === 'content' ? 'wordmark' : null
  if (other && type.active[script][other] === key)
    exit(`${face.family} is already the ${script} ${other} face. Keep those two on different faces.`)
}

type.active[script][role] = key
writeFileSync(file, JSON.stringify(type, null, 2) + '\n')
console.log(`\n  ${script}.${role}: ${describe(was)} -> ${describe(key)}`)

if (!isAlias && !existsSync(p('brand/fonts', key))) {
  console.log(`  vendoring ${type.catalog[key].family}…`)
  execFileSync(process.execPath, [p('tools/fonts-fetch.mjs')], { stdio: 'inherit' })
}
execFileSync(process.execPath, [p('tools/build-tokens.mjs')], { stdio: 'inherit' })
console.log(`\n  Tokens rebuilt. Run \`npm run build\` to regenerate the logos and documents that use it.\n`)

function exit(msg) { console.error(`\n  ${msg}\n`); process.exit(1) }
