#!/usr/bin/env node
/**
 * Vendors the ACTIVE faces into brand/fonts/ so the repository builds the same
 * way on every machine and in CI. A brand that depends on what happens to be
 * installed locally is a brand that renders differently for every person who
 * opens it.
 *
 *   npm run fonts:fetch          vendor whatever brand/tokens/type.json activates
 *   npm run fonts:fetch -- --all vendor the whole catalogue, for trying a switch
 *
 * Every face is OFL, so redistributing it inside this repository is allowed.
 * The licence is downloaded beside the files and `npm run check` fails if it is
 * ever missing.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { p } from './lib/paths.mjs'
import { loadTokens } from './lib/tokens.mjs'

const UA = { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36' }
const OFL = 'https://raw.githubusercontent.com/google/fonts/main/ofl'
const GH  = 'https://api.github.com'

async function fetchFace(key, face) {
  const dir = p('brand/fonts', key)
  mkdirSync(dir, { recursive: true })

  // Pull complete .ttf files from the upstream google/fonts repository rather
  // than from the Google Fonts CSS API. The API serves per-script SUBSETS — one
  // file for arabic, one for latin — so a download keyed by weight keeps only
  // the last subset and silently strips the Arabic glyphs. For an Arabic-first
  // brand that failure stays invisible until a wordmark renders blank. Upstream
  // .ttf files carry every script in one file.
  const slug = face.family.toLowerCase().replace(/\s+/g, '')
  const listing = await fetch(`${GH}/repos/google/fonts/contents/ofl/${slug}`, { headers: UA })
  if (!listing.ok) throw new Error(`${face.family}: no ofl/${slug} upstream (HTTP ${listing.status})`)

  const files = (await listing.json())
    .filter((f) => f.name.endsWith('.ttf') && !/Italic/i.test(f.name))
  if (!files.length) throw new Error(`${face.family}: no upright .ttf upstream`)

  const written = []
  for (const f of files) {
    const buf = Buffer.from(await fetch(f.download_url, { headers: UA }).then((r) => r.arrayBuffer()))
    writeFileSync(p('brand/fonts', key, f.name), buf)
    written.push({ name: f.name, bytes: buf.length, variable: f.name.includes('[') })
  }

  // The licence travels with the files, always.
  const lic = await fetch(`${OFL}/${slug}/OFL.txt`, { headers: UA }).catch(() => null)
  if (lic?.ok) writeFileSync(p('brand/fonts', key, 'OFL.txt'), await lic.text())
  else writeFileSync(p('brand/fonts', key, 'OFL.txt'),
    face.family + ' is licensed under the SIL Open Font License 1.1.\nFull text: ' + face.source + '\n')

  writeFileSync(p('brand/fonts', key, 'face.json'), JSON.stringify(
    { key, family: face.family, license: face.license, source: face.source, files: written }, null, 2) + '\n')

  return written
}

const tokens = loadTokens()
const type = JSON.parse(readFileSync(p('brand/tokens/type.json'), 'utf8'))
const all = process.argv.includes('--all')

const wanted = all
  ? Object.keys(type.catalog).filter((k) => !k.startsWith('$'))
  : [...new Set(Object.values(tokens.fonts).flatMap((r) => Object.values(r).map((f) => f.key)))]

console.log(`Vendoring ${wanted.length} face${wanted.length === 1 ? '' : 's'} into brand/fonts/\n`)
let failed = 0
for (const key of wanted) {
  const face = type.catalog[key]
  try {
    const files = await fetchFace(key, face)
    console.log(`  ${face.family.padEnd(24)} ${files.length} file(s), ${(files.reduce((n, f) => n + f.bytes, 0) / 1024 | 0)} KB`)
  } catch (e) {
    console.error(`  ${face.family.padEnd(24)} FAILED — ${e.message}`)
    failed++
  }
}
console.log(failed ? `\n${failed} face(s) failed.` : '\nDone. Fonts are vendored; the build no longer depends on what is installed locally.')
process.exit(failed ? 1 : 0)
