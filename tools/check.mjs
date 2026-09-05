#!/usr/bin/env node
/**
 * Everything that can be verified without a person looking at it.
 *
 *   npm run check
 *   npm run check -- --only=fonts
 *
 * These are the failures that otherwise ship: a wordmark set in a face nobody
 * vendored, an accent that silently fell back, a licence that never travelled
 * with its font, a glyph with a hard-coded colour that survives into the
 * one-ink variant. None of them look wrong on the screen of the person who
 * introduced them.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { p } from './lib/paths.mjs'
import { loadTokens, symbolPalette } from './lib/tokens.mjs'
import { archPath } from './arch.mjs'
import { loadEntities } from './lib/entities.mjs'

const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]
const problems = []
const fail = (area, msg) => problems.push({ area, msg })
const run = (name, fn) => { if (!only || only === name) fn() }

const tokens = loadTokens()

/* ── fonts ──────────────────────────────────────────────────────────────── */
run('fonts', () => {
  const type = JSON.parse(readFileSync(p('brand/tokens/type.json'), 'utf8'))

  // Exactly two Arabic faces, one per role. The rule the brand is built on.
  // The token files carry $-prefixed documentation keys so they teach whoever
  // opens them. Never iterate them as data.
  const roleEntries = (o) => Object.entries(o).filter(([k]) => !k.startsWith('$'))

  // The rule the brand is built on: a wordmark face and a content face, and not
  // the same face for both. Other roles may ALIAS one of them — that is how the
  // motto follows the content face without becoming a third.
  for (const script of ['arabic', 'latin']) {
    const roles = type.active[script]
    if (!roles) { fail('fonts', `type.active has no ${script}`); continue }
    if (roles.wordmark === roles.content) {
      fail('fonts', `type.active.${script}: wordmark and content are both "${roles.wordmark}" — a document set in the wordmark face stops looking like a document`)
    }
  }

  // loadTokens resolves the aliases and the per-role capabilities and throws
  // with the reason. Surface that instead of restating the rules here.
  try { loadTokens() } catch (e) { fail('fonts', e.message) }

  for (const [script, roles] of roleEntries(type.active)) {
    for (const [role, value] of roleEntries(roles)) {
      // An alias names another role on the same script; loadTokens resolved it.
      if (!type.catalog[value]) {
        if (!(value in roles)) fail('fonts', `active.${script}.${role} = "${value}" is neither a catalogue face nor another role on ${script}`)
        continue
      }
      const key = value
      const face = type.catalog[key]
      if (!face.scripts.includes(script)) fail('fonts', `"${key}" does not set ${script}`)

      const dir = p('brand/fonts', key)
      if (!existsSync(dir)) { fail('fonts', `${face.family} is not vendored — run \`npm run fonts:fetch\``); continue }
      const files = readdirSync(dir)
      if (!files.some((f) => f.endsWith('.ttf'))) fail('fonts', `${face.family} has no .ttf in brand/fonts/${key}/`)
      // A font redistributed without its licence is a licence breach that
      // travels with every copy of the repository.
      if (!files.includes('OFL.txt')) fail('fonts', `${face.family} has no OFL.txt beside it — the licence must travel with the files`)
    }
  }
})

/* ── entities ───────────────────────────────────────────────────────────── */
run('entities', () => {
  const { entities } = loadEntities(tokens)          // throws on a structural error
  for (const e of entities) {
    if (e.glyph && !existsSync(p('logos/src/glyphs', `${e.glyph}.svg`)))
      fail('entities', `${e.id}: glyph "${e.glyph}" has no file in logos/src/glyphs/`)
    if (e.layouts.includes('seal') && !existsSync(p('logos/src/seal.svg')))
      fail('entities', `${e.id}: asks for a seal, but logos/src/seal.svg is missing`)
    if (e.until && new Date(e.until) < new Date() && !e.archived)
      fail('entities', `${e.id}: its mandate ended ${String(e.until).slice(0, 10)} — set \`status: archived\``)
  }
})

/**
 * Well-formedness, for the handful of ways hand-edited SVG actually breaks.
 *
 * This exists because a documentation comment once took the whole symbol down:
 * an XML comment may not contain a double hyphen, and the comment explaining
 * the custom-property syntax spelled that syntax out. Every renderer refused
 * the file, but the build still "passed" — nothing here parsed XML, so the
 * error only surfaced when someone opened the file in an editor.
 */
function xmlProblems(svg) {
  const out = []

  // Comments: a double hyphen inside one is illegal, and an unterminated one
  // swallows the rest of the document.
  let i = 0
  while ((i = svg.indexOf('<!--', i)) !== -1) {
    const close = svg.indexOf('-->', i + 4)
    if (close === -1) { out.push(`unterminated comment at offset ${i}`); break }
    const body = svg.slice(i + 4, close)
    if (body.includes('--')) {
      const snippet = body.slice(Math.max(0, body.indexOf('--') - 30), body.indexOf('--') + 20).replace(/\s+/g, ' ')
      out.push(`comment contains a double hyphen, which XML forbids: "…${snippet}…"`)
    }
    i = close + 3
  }

  // Tag balance.
  const stack = []
  const withoutComments = svg.replace(/<!--[\s\S]*?-->/g, '')
  for (const m of withoutComments.matchAll(/<(\/?)([a-zA-Z][\w:-]*)("[^"]*"|'[^']*'|[^>"'])*?(\/?)>/g)) {
    const [, closing, tag, , selfClosing] = m
    if (closing) {
      const open = stack.pop()
      if (open !== tag) out.push(`closing </${tag}> does not match ${open ? `<${open}>` : 'anything'}`)
    } else if (!selfClosing) stack.push(tag)
  }
  if (stack.length) out.push(`unclosed <${stack[stack.length - 1]}>`)

  // Bare ampersands.
  const bare = withoutComments.match(/&(?!(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][\w]*);)/g)
  if (bare) out.push(`${bare.length} unescaped "&" — write &amp;`)

  return out
}

/* ── artwork ────────────────────────────────────────────────────────────── */
run('artwork', () => {
  // Templated artwork: recoloured per variant, so it carries no literal colour
  // and no type.
  const templated = [p('logos/src/symbol.svg'),
    ...readdirSync(p('logos/src/glyphs')).filter((f) => f.endsWith('.svg')).map((f) => p('logos/src/glyphs', f)),
    ...(existsSync(p('logos/src/marks'))
      ? readdirSync(p('logos/src/marks')).filter((f) => f.endsWith('.svg')).map((f) => p('logos/src/marks', f))
      : [])]

  // Every var() an event's artwork uses must exist in all four variants, or the
  // mark silently loses a shape in the one variant nobody previews.
  if (existsSync(p('logos/src/marks'))) {
    for (const f of readdirSync(p('logos/src/marks')).filter((f) => f.endsWith('.svg'))) {
      const mark = f.replace(/\.svg$/, '')
      const used = new Set([...readFileSync(p('logos/src/marks', f), 'utf8')
        .matchAll(/var\(\s*--([\w-]+)\s*,/g)].map((m) => m[1]))
      const block = tokens.marks[mark]
      if (!block) { fail('artwork', `marks/${f}: no "${mark}" block under marks in color.json`); continue }
      for (const variant of ['color', 'grayscale', 'mono-dark', 'mono-light']) {
        if (!block[variant]) { fail('artwork', `marks.${mark}: no "${variant}" variant`); continue }
        for (const slot of used) {
          if (!(slot in block[variant])) fail('artwork', `marks.${mark}.${variant}: missing "${slot}", which marks/${f} uses`)
        }
      }
    }
  }

  // The seal is exempt from both rules and deliberately so: it is the official
  // stamp reproduced verbatim, it carries its own navy and its own lettering,
  // and it is never recoloured. It still has to parse.
  for (const f of [...templated, p('logos/src/seal.svg')]) {
    if (!existsSync(f)) continue
    for (const problem of xmlProblems(readFileSync(f, 'utf8')))
      fail('artwork', `${f.split('/').slice(-2).join('/')}: ${problem}`)
  }

  // The arch is derived geometry. If the tokens have moved and the drawing has
  // not, the token file is describing something the mark no longer looks like.
  const svg = readFileSync(p('logos/src/symbol.svg'), 'utf8')
  const drawn = svg.match(/<path d="([^"]*)"\s+fill="var\(--arch,/)?.[1]
  if (!drawn) fail('artwork', 'src/symbol.svg: no arch path found')
  else if (drawn !== archPath(tokens.space.logo.arch))
    fail('artwork', 'src/symbol.svg: the arch no longer matches logo.arch in space.json — run `npm run arch`')

  for (const f of templated) {
    const svg = readFileSync(f, 'utf8')
    const name = f.split('/').slice(-2).join('/')
    // A hex code in source artwork survives into every variant, including the
    // one-ink ones, where it ruins the whole point of a one-ink logo. The one
    // permitted place is a var() fallback, which exists so the file previews
    // correctly in an editor and is never what the build uses.
    const body = svg.replace(/<!--[\s\S]*?-->/g, '')
    const bare = body.replace(/var\(\s*--[\w-]+\s*,[^)]*\)/g, '')
    const hex = bare.match(/#[0-9a-fA-F]{3,8}\b/g)
    if (hex) fail('artwork', `${name}: hard-coded colour ${[...new Set(hex)].join(', ')} — use var(--token, <fallback>)`)

    // The fallback must still be the truth. Left unchecked it rots: someone
    // changes a token, every generated file updates, and the source file alone
    // goes on previewing the old colour.
    if (f.endsWith('symbol.svg')) {
      const want = symbolPalette(tokens, 'color', 'copper')
      for (const [, key, fb] of body.matchAll(/var\(\s*--([\w-]+)\s*,\s*([^)]*?)\s*\)/g)) {
        if (!(key in want)) { fail('artwork', `${name}: var(--${key}) is not defined by any variant`); continue }
        if (fb.toLowerCase() !== String(want[key]).toLowerCase())
          fail('artwork', `${name}: var(--${key}) previews as ${fb} but the colour variant is ${want[key]} — update the fallback`)
      }
    }
    if (/<text[\s>]/.test(body)) fail('artwork', `${name}: contains <text>. Artwork carries no type; wordmarks are typeset by the engine.`)
  }
})

/* ── generated output ───────────────────────────────────────────────────── */
run('dist', () => {
  if (!existsSync(p('logos/dist'))) return fail('dist', 'logos/dist is missing — run `npm run build:logos`')
  const { entities } = loadEntities(tokens)
  for (const e of entities) {
    const dir = p('logos/dist', e.dir)
    if (!existsSync(dir)) { fail('dist', `${e.id}: nothing generated at logos/dist/${e.dir}`); continue }
    const files = readdirSync(dir)
    for (const layout of e.layouts) {
      if (layout === 'seal') continue
      if (!files.some((f) => f.startsWith(layout + '-')))
        fail('dist', `${e.id}: layout "${layout}" produced no files`)
    }
  }
})

/* ── report ─────────────────────────────────────────────────────────────── */
if (!problems.length) {
  console.log('  everything checks out.')
  process.exit(0)
}
const byArea = {}
for (const { area, msg } of problems) (byArea[area] ??= []).push(msg)
for (const [area, msgs] of Object.entries(byArea)) {
  console.error(`\n  ${area}`)
  for (const m of msgs) console.error(`    - ${m}`)
}
console.error(`\n  ${problems.length} problem${problems.length === 1 ? '' : 's'}.\n`)
process.exit(1)
