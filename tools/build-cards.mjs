#!/usr/bin/env node
/**
 * Renders every card described in content/cards/.
 *
 *   content/cards/<name>.json  ->  dist/cards/<name>-<format>.png
 *
 * Each file names its template, its format(s) and its values. Keeping published
 * cards as data in git means a matchday can be re-rendered after a template
 * change, and a card that went out wrong can be traced to the values that made
 * it.
 *
 * Most cards will be made in the studio (`npm run studio`) rather than here.
 * This is the batch path: a whole matchday in one command.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { p } from './lib/paths.mjs'
import { cardPng } from './lib/card.mjs'
import { closeBrowser } from './lib/render.mjs'

const src = p('content/cards')
mkdirSync(p('dist/cards'), { recursive: true })
const files = existsSync(src) ? readdirSync(src).filter((f) => f.endsWith('.json')) : []

if (!files.length) console.log('  no cards in content/cards/ yet — try `npm run studio`')

for (const file of files) {
  const spec = JSON.parse(readFileSync(join(src, file), 'utf8'))
  const name = basename(file, '.json')
  const { template, formats = ['square'], locale = 'ar', ...data } = spec
  if (!template) throw new Error(`${file}: needs a "template" naming a folder in templates/social/cards/`)

  for (const format of formats) {
    const png = await cardPng(template, data, { format, locale })
    writeFileSync(p('dist/cards', `${name}-${format}.png`), png)
    console.log(`  ${(name + '-' + format).padEnd(46)} ${(png.length / 1024 | 0)} KB`)
  }
}
await closeBrowser()
