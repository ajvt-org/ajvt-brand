import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { p } from './paths.mjs'
import { loadTokens } from './tokens.mjs'
import { loadEntities } from './entities.mjs'
import { textToPathBidi } from './text-to-path.mjs'
import { frameSvg } from './frame-svg.mjs'
import { svgToPng } from './render.mjs'
import sharp from 'sharp'

/**
 * Frames — furniture laid OVER a photograph, not a card.
 *
 * A frame carries no data fields. Every string on it comes out of
 * brand/entities.yml, so the competition cannot be misspelled on a matchday and
 * the endorsement cannot drift from the one the lockups use. There is
 * deliberately no `data` argument.
 *
 * SVG, not HTML. A frame is scaled onto whatever a phone happened to shoot —
 * 4032px and rising — and a raster overlay built for 2160 is soft by the time
 * it gets there. Vector is the only form that is right at every size, and it is
 * what lets the offline compositor draw the frame at the photograph's own
 * pixel dimensions instead of resampling anything.
 */

export function listFrames() {
  const dir = p('templates/social/frames')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((d) => existsSync(p('templates/social/frames', d, 'frame.json')))
    .map((d) => JSON.parse(readFileSync(p('templates/social/frames', d, 'frame.json'), 'utf8')))
}

/** A mark as embeddable geometry: its viewBox, its contents, and — the part
 *  that matters for placing it — where the INK actually is inside that box.
 *
 *  A symbol file is not full-bleed. It carries the clear space the guidelines
 *  require, a quarter of the symbol's diameter on every side, which is why a
 *  mark set to "9% of the width" arrives looking like 6%: a third of the box it
 *  was given is deliberately empty. Sizing and insetting by the ink instead
 *  means the number in the layout is the size you actually see, and that both
 *  marks come out equally far from their corners even though the cup is a tall
 *  narrow object and the roundel is a circle.
 *
 *  Measured rather than assumed: the padding is a convention of the generator
 *  that draws these files, not something this one can read off the viewBox, and
 *  a redrawn mark would silently shift. One rasterise per mark per build. */
async function loadMark(dir) {
  const f = p('logos/dist', dir, 'symbol-color.svg')
  if (!existsSync(f)) throw new Error(`no colour symbol at logos/dist/${dir}/symbol-color.svg — run \`npm run build:logos\``)
  const raw = readFileSync(f, 'utf8')
  const vb = raw.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
  if (!vb) throw new Error(`${f}: no viewBox`)
  const vbW = parseFloat(vb[1]), vbH = parseFloat(vb[2])
  const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')

  const N = 256
  const { data, info } = await sharp(Buffer.from(raw), { density: 96 })
    .resize({ width: N, height: N, fit: 'fill' })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) throw new Error(`${f}: rasterises to nothing`)
  const sx = vbW / info.width, sy = vbH / info.height
  return {
    vbW, vbH, inner,
    inkX: minX * sx, inkY: minY * sy,
    inkW: (maxX - minX + 1) * sx, inkH: (maxY - minY + 1) * sy,
  }
}

const EM = 100  // every string is baked at this size and scaled at emit time

/** Outlines one string. Arabic is a joining script and the year is a Latin run
 *  inside an Arabic one, so this goes through the bidi-aware shaper — see the
 *  note in text-to-path.mjs about what shaping it by hand gets wrong. */
function bake(text, weight) {
  const file = p('brand/fonts/tajawal', weight >= 800 ? 'Tajawal-ExtraBold.ttf' : 'Tajawal-Medium.ttf')
  if (!existsSync(file)) throw new Error(`Tajawal is not vendored at ${file} — run \`npm run fonts:fetch\``)
  const r = textToPathBidi(text, { fontFile: file, size: EM, baseDir: 'rtl', weight })
  return { d: r.d, width: r.width, minY: r.bounds.minY, em: EM }
}

/** Everything a frame needs, resolved from the registry once. */
export async function frameParts(frameId, { locale = 'ar' } = {}) {
  const dir = p('templates/social/frames', frameId)
  if (!existsSync(dir)) throw new Error(`no frame template "${frameId}" in templates/social/frames/`)
  const def = JSON.parse(readFileSync(join(dir, 'frame.json'), 'utf8'))

  const tokens = loadTokens()
  const { entities, primary } = loadEntities(tokens)
  const entity = entities.find((e) => e.id === def.entity)
  if (!entity) throw new Error(`${frameId}: frame.json names entity "${def.entity}", which is not in entities.yml`)

  return {
    def,
    accent: entity.accentColor.base,
    marks: { cup: await loadMark(entity.dir), ajvt: await loadMark(primary.dir) },
    text: {
      name: bake(entity.name[locale], 800),
      season: bake(locale === 'ar' ? `موسم ${entity.season}` : `Saison ${entity.season}`, 500),
      // The eyebrow every non-parent mark inherits from the association — the
      // short endorsement, not the full registered name, which runs too wide at
      // a size meant to stay quiet.
      org: bake(entity.wordmark?.[locale]?.eyebrow ?? primary.name[locale], 500),
    },
  }
}

export function frameSvgFor(frameId, { w, h, parts }) {
  const { accent, marks, text } = parts
  return frameSvg({ w, h, accent, marks, text })
}

export async function framePng(frameId, { w, h, parts }) {
  return svgToPng(frameSvgFor(frameId, { w, h, parts }), { width: w, density: 96 })
}

export { frameSvg }
