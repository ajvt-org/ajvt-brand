#!/usr/bin/env node
/**
 * Builds the team crests: logos/src/teams/<event>/*.svg -> logos/dist/teams/<event>/.
 *
 *   node tools/build-team-crests.mjs                 every event
 *   node tools/build-team-crests.mjs mayor-cup-2026  just that one
 *
 * A team crest is NOT a lockup. It carries no mosque, no endorsement and no
 * wordmark composed by the engine, so it does not go through buildLockup and it
 * is not in brand/entities.yml — a club is a competitor, not the association
 * acting in some field. What it shares with the rest of the system is this
 * build: outline the type, emit the same formats, keep dist reproducible.
 *
 * THE TYPE IS OUTLINED HERE, NOT IN THE SOURCE. The source files keep a real
 * <text> element so a name can be corrected by editing a string, and only the
 * generated copy is baked. That is the opposite of the rule for logos/src —
 * where <text> is banned outright — and the reason is that these eight are
 * hand-drawn artwork rather than engine input: there is no layout pass that
 * would re-typeset them, so the editable string has to live somewhere, and the
 * source is the only place left.
 *
 * Outlining matters more here than anywhere else in the repository, because
 * these eight deliberately use EIGHT DIFFERENT FACES. A lockup falls back to
 * one wrong font; a crest set falls back to eight, and Arabic that falls back
 * does not merely change shape — it RESHAPES, because the joining forms are
 * resolved per face. Baking the outlines is what makes the file mean the same
 * thing in a browser, in Illustrator and at a print shop.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'
import { p } from './lib/paths.mjs'
import { textToPathBidi } from './lib/text-to-path.mjs'
import { svgToPng, svgToPdf, closeBrowser } from './lib/render.mjs'

const SRC = p('logos/src/teams')
const OUT = p('logos/dist/teams')
const PNG_SIZES = [256, 512, 1024]

/**
 * family + weight -> the actual file to shape with.
 *
 * A variable font is given the weight so the axis gets set; a static family is
 * given the file that already IS that weight and no axis, because setting an
 * axis a static face does not have silently does nothing and you get Regular.
 */
const FACES = {
  'Changa':               { file: 'changa/Changa[wght].ttf',                    variable: true },
  'Reem Kufi':            { file: 'reem-kufi/ReemKufi[wght].ttf',               variable: true },
  'Cairo':                { file: 'cairo/Cairo[slnt,wght].ttf',                 variable: true },
  'El Messiri':           { file: 'el-messiri/ElMessiri[wght].ttf',             variable: true },
  'Almarai':              { 800: 'almarai/Almarai-ExtraBold.ttf', 700: 'almarai/Almarai-Bold.ttf' },
  'Lalezar':              { 400: 'lalezar/Lalezar-Regular.ttf' },
  'Tajawal':              { 900: 'tajawal/Tajawal-Black.ttf', 800: 'tajawal/Tajawal-ExtraBold.ttf',
                            700: 'tajawal/Tajawal-Bold.ttf' },
  'IBM Plex Sans Arabic': { 700: 'ibm-plex-sans-arabic/IBMPlexSansArabic-Bold.ttf',
                            600: 'ibm-plex-sans-arabic/IBMPlexSansArabic-SemiBold.ttf' },
}

function faceFor(family, weight) {
  const e = FACES[family]
  if (!e) throw new Error(`no vendored face for "${family}" — add it to FACES in this file`)
  if (e.variable) return { file: p('brand/fonts', e.file), weight }
  const file = e[weight]
  if (!file) {
    throw new Error(
      `${family} has no ${weight} weight vendored (has ${Object.keys(e).join(', ')}). ` +
      `Pick a weight it has, or vendor the missing file.`
    )
  }
  return { file: p('brand/fonts', file), weight: null }
}

const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1]
// Stop at the semicolon and nothing else. Excluding quotes from the class looks
// tidier and silently returns empty for `font-family:'Reem Kufi',sans-serif`,
// because the value's very first character is the quote.
const styleVal = (style, prop) => style?.match(new RegExp(`${prop}\\s*:\\s*([^;]+)`))?.[1]?.trim()

/** Replace every <text> in an SVG with an outlined <path>. */
function outline(svg, label) {
  return svg.replace(/<text\b([^>]*)>([\s\S]*?)<\/text>/g, (_m, attrs, content) => {
    const text = content.replace(/<[^>]*>/g, '').trim()
    const style = attr(attrs, 'style') ?? ''
    const family = (styleVal(style, 'font-family') ?? attr(attrs, 'font-family') ?? '')
      .split(',')[0].replace(/['"]/g, '').trim()
    const weight = parseInt(styleVal(style, 'font-weight') ?? attr(attrs, 'font-weight') ?? '400', 10)
    const size = parseFloat(styleVal(style, 'font-size') ?? attr(attrs, 'font-size') ?? '44')
    const x = parseFloat(attr(attrs, 'x') ?? '0')
    const y = parseFloat(attr(attrs, 'y') ?? '0')
    const fill = attr(attrs, 'fill') ?? '#000'
    const anchor = attr(attrs, 'text-anchor') ?? 'start'

    const { file, weight: axis } = faceFor(family, weight)
    // baseDir rtl, and via textToPathBidi rather than textToPath: a name that
    // ever gains a Latin suffix ("Lubnan FC") would otherwise shape as one
    // right-to-left run and come out reversed. See the harfbuzz note in AGENTS.md.
    const { d, width } = textToPathBidi(text, { fontFile: file, size, weight: axis, baseDir: 'rtl' })
    if (!d) throw new Error(`${label}: "${text}" shaped to nothing in ${family}`)

    const dx = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x
    console.log(`    "${text}"  ${family} ${weight} ${size}px  ->  ${d.length} chars`)
    return `<path fill="${fill}" transform="translate(${dx.toFixed(2)},${y})" d="${d}"/>`
  })
}

async function buildEvent(event) {
  const dir = join(SRC, event)
  const outDir = join(OUT, event)
  mkdirSync(outDir, { recursive: true })
  const files = readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()

  for (const f of files) {
    const id = basename(f, '.svg')
    console.log(`  ${event}/${id}`)
    const svg = outline(readFileSync(join(dir, f), 'utf8'), `${event}/${id}`)
    writeFileSync(join(outDir, `${id}.svg`), svg)
    for (const w of PNG_SIZES) {
      writeFileSync(join(outDir, `${id}-${w}.png`), await svgToPng(svg, { width: w }))
    }
    writeFileSync(join(outDir, `${id}.pdf`), await svgToPdf(svg))
  }
  return files.length
}

const only = process.argv[2]
const events = existsSync(SRC)
  ? readdirSync(SRC, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : []
const todo = only ? events.filter((e) => e === only) : events
if (only && !todo.length) throw new Error(`no such event: logos/src/teams/${only}`)

let n = 0
for (const e of todo) n += await buildEvent(e)
await closeBrowser()
console.log(`\n${n} crest(s) -> logos/dist/teams/  (svg + ${PNG_SIZES.join('/')} png + pdf)`)
