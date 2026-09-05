import { readFileSync } from 'node:fs'
import { Blob, Face, Font, Buffer as HbBuffer, Variation, shape } from 'harfbuzzjs'

/**
 * Converts a run of text into SVG path data.
 *
 * Why the logo files must not contain <text>: a print shop, an embroiderer or
 * Illustrator will not have Tajawal installed, and Arabic that falls back to
 * another face does not merely look different — it RESHAPES. Outlining makes a
 * logo file mean the same thing everywhere it is opened.
 *
 * Why harfbuzz and not a font parser: Arabic is a joining script. "التاكلالت"
 * is not a sequence of independent letters — each takes an initial, medial,
 * final or isolated form, and several pairs form obligatory ligatures. Only a
 * real shaping engine gets that right, and getting it wrong is the kind of
 * error that ships, because wrong output still looks like Arabic to someone who
 * does not read it.
 */

const cache = new Map()

function loadFont(file, weight) {
  const key = `${file}@${weight ?? 'default'}`
  if (cache.has(key)) return cache.get(key)
  const blob = new Blob(readFileSync(file))
  const face = new Face(blob, 0)
  const font = new Font(face)
  const upem = face.upem
  font.setScale(upem, upem)          // work in em units, scale at emit time

  // A variable font shapes at its DEFAULT instance unless the axes are set —
  // usually Regular. Asking for a 700 wordmark and getting 400 back looks like
  // a font that is merely a bit light, not like a bug, so it survives review.
  if (weight) {
    const axes = face.getAxisInfos?.() ?? {}
    const wght = axes.wght
    if (wght) {
      // The runtime reports the axis range as min/max; the typings say
      // minValue/maxValue. Reading the wrong pair yields NaN, and a NaN
      // variation does not throw — it quietly shapes at some other weight.
      const lo = wght.min ?? wght.minValue ?? 100
      const hi = wght.max ?? wght.maxValue ?? 900
      font.setVariations([new Variation('wght', Math.min(hi, Math.max(lo, weight)))])
    }
  }

  const entry = { font, upem }
  cache.set(key, entry)
  return entry
}

const round = (n, dp = 2) => Number(n.toFixed(dp))

/**
 * Ink extents of a baked path.
 *
 * Needed because an em box is a poor proxy for how tall a word actually is —
 * Arabic set at 62 em units occupies far less than 62 units of ink, so fitting
 * a wordmark by its em box shrinks it well below what the space allows. Control
 * points are included, so the box is never smaller than the true outline.
 */
export function pathBounds(d) {
  if (!d) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
  let cmd = 'M', axis = 0
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  let pendingX = 0
  for (const m of d.matchAll(/([A-Za-z])|(-?\d*\.?\d+(?:e-?\d+)?)/g)) {
    if (m[1]) { cmd = m[1]; axis = 0; continue }
    const v = parseFloat(m[2])
    const isX = cmd === 'H' ? true : cmd === 'V' ? false : axis % 2 === 0
    axis++
    if (isX) { pendingX = v; if (v < minX) minX = v; if (v > maxX) maxX = v }
    else { if (v < minY) minY = v; if (v > maxY) maxY = v }
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

function shapeRun(text, { fontFile, direction, script, language, weight }) {
  const { font, upem } = loadFont(fontFile, weight)
  const buf = new HbBuffer()
  buf.addText(text)
  if (direction) buf.setDirection(direction)
  if (script) buf.setScript(script)
  if (language) buf.setLanguage(language)
  buf.guessSegmentProperties()       // fills in anything not set explicitly
  shape(font, buf)
  return { font, upem, glyphs: buf.getGlyphInfosAndPositions() }
}

/**
 * Shaped text as ONE <path d> string.
 *
 * Coordinates come back with the baseline at y=0 and y growing downward (SVG
 * convention), scaled so `size` is the em height. The flip and the pen advance
 * are baked into the numbers rather than expressed as a wrapping transform:
 * cutting plotters and older print RIPs read a bare `d` reliably, nested
 * transforms they sometimes do not.
 */
export function textToPath(text, { fontFile, size = 100, direction, script, language, weight }) {
  const { font, upem, glyphs } = shapeRun(text, { fontFile, direction, script, language, weight })
  const s = size / upem
  let penX = 0, penY = 0, d = ''

  for (const g of glyphs) {
    const raw = font.glyphToPath(g.g ?? g.glyphId ?? g.codepoint)
    if (raw) {
      const ox = (penX + (g.xOffset ?? g.dx ?? 0)) * s
      const oy = (penY + (g.yOffset ?? g.dy ?? 0)) * s
      d += bake(raw, ox, oy, s) + ' '
    }
    penX += g.xAdvance ?? g.ax ?? 0
    penY += g.yAdvance ?? g.ay ?? 0
  }

  const out = d.trim()
  return { d: out, width: penX * s, height: size, glyphCount: glyphs.length, bounds: pathBounds(out) }
}

/** Applies translate + y-flip + scale directly to every coordinate in `d`. */
function bake(d, tx, ty, s) {
  let cmd = 'M', axis = 0
  return d.replace(/([A-Za-z])|(-?\d*\.?\d+(?:e-?\d+)?)/g, (m, letter, num) => {
    if (letter) { cmd = letter; axis = 0; return letter }
    const v = parseFloat(num)
    // H takes x only, V takes y only; everything else alternates x,y.
    const isX = cmd === 'H' ? true : cmd === 'V' ? false : axis % 2 === 0
    axis++
    return String(round(isX ? tx + v * s : ty - v * s))
  })
}

/** Advance width of a run without emitting geometry — used to size lockups. */
export function measure(text, opts) {
  const { upem, glyphs } = shapeRun(text, opts)
  const s = (opts.size ?? 100) / upem
  return glyphs.reduce((w, g) => w + (g.xAdvance ?? g.ax ?? 0), 0) * s
}

/* ── Bidirectional text ───────────────────────────────────────────────────
 *
 * harfbuzz shapes ONE run in ONE direction and deliberately does not implement
 * the Unicode Bidirectional Algorithm — that is the caller's job. Handing it
 * "تحت 18 سنة (U18)" with direction rtl reverses everything, and the mark reads
 * "تحت 81 سنة (81U)". The digits are wrong, and nobody who does not read Arabic
 * will catch it, because it still looks like Arabic.
 *
 * This is a deliberate subset of the UBA: strong directional characters,
 * numbers, and neutrals resolved by their surroundings. It covers what actually
 * appears in AJVT's marks — an Arabic name with an embedded year, age group,
 * Latin acronym or bracketed abbreviation. It does not implement explicit
 * embedding controls or bracket pairing; if a wordmark ever needs those, use a
 * full UBA implementation rather than extending this.
 */

const RTL_RE = /[֐-׿؀-ۿݐ-ݿࢠ-ࣿיִ-﷿ﹰ-﻿]/
const LTR_RE = /[A-Za-zÀ-ʯͰ-֏]/
const NUM_RE = /[0-9٠-٩۰-۹]/

const classOf = (ch) =>
  RTL_RE.test(ch) ? 'R' : LTR_RE.test(ch) ? 'L' : NUM_RE.test(ch) ? 'N' : 'X'

/**
 * Splits text into directional runs in LOGICAL order.
 * Numbers attach to a preceding Latin run, otherwise form their own LTR run —
 * which is what makes "18" inside Arabic read as eighteen and not eighty-one.
 * Neutrals join the run on their left, except a trailing neutral before a
 * direction change, which goes with the base direction.
 */
function splitRuns(text, baseDir) {
  const base = baseDir === 'rtl' ? 'R' : 'L'
  const chars = [...text]
  const types = chars.map(classOf)

  // Resolve neutrals: a neutral between two runs of the same direction takes
  // that direction, otherwise it takes the base direction.
  for (let i = 0; i < types.length; i++) {
    if (types[i] !== 'X') continue
    let before = base, after = base
    for (let j = i - 1; j >= 0; j--) if (types[j] !== 'X') { before = types[j] === 'N' ? 'L' : types[j]; break }
    for (let j = i + 1; j < types.length; j++) if (types[j] !== 'X') { after = types[j] === 'N' ? 'L' : types[j]; break }
    types[i] = before === after ? before : base
  }
  // Numbers run left to right wherever they sit.
  for (let i = 0; i < types.length; i++) if (types[i] === 'N') types[i] = 'L'

  const runs = []
  for (let i = 0; i < chars.length; i++) {
    const dir = types[i] === 'R' ? 'rtl' : 'ltr'
    const last = runs[runs.length - 1]
    if (last && last.dir === dir) last.text += chars[i]
    else runs.push({ dir, text: chars[i] })
  }
  return runs
}

/**
 * Shapes mixed-direction text and returns one merged path.
 *
 * Reordering, per the UBA: in a right-to-left paragraph the runs are placed in
 * reverse logical order, and each run keeps the internal glyph order harfbuzz
 * gave it. A left-to-right run inside Arabic therefore ends up in the correct
 * place AND reads correctly inside itself.
 */
export function textToPathBidi(text, { fontFile, size = 100, baseDir = 'rtl', language, weight }) {
  const runs = splitRuns(text, baseDir)
  if (runs.length === 1) {
    return textToPath(text, {
      fontFile, size, weight, direction: runs[0].dir,
      script: runs[0].dir === 'rtl' ? 'Arab' : 'Latn',
      language: language ?? (runs[0].dir === 'rtl' ? 'ar' : 'en'),
    })
  }

  const shaped = runs.map((r) => ({
    ...r,
    ...textToPath(r.text, {
      fontFile, size, weight, direction: r.dir,
      script: r.dir === 'rtl' ? 'Arab' : 'Latn',
      language: language ?? (r.dir === 'rtl' ? 'ar' : 'en'),
    }),
  }))

  const visual = baseDir === 'rtl' ? [...shaped].reverse() : shaped
  let x = 0, d = ''
  for (const run of visual) {
    if (run.d) d += shiftX(run.d, x) + ' '
    x += run.width
  }
  const out = d.trim()
  return { d: out, width: x, height: size, glyphCount: shaped.reduce((n, r) => n + r.glyphCount, 0), bounds: pathBounds(out) }
}

/** Offsets every x coordinate in a path by dx. */
function shiftX(d, dx) {
  if (!dx) return d
  let cmd = 'M', axis = 0
  return d.replace(/([A-Za-z])|(-?\d*\.?\d+(?:e-?\d+)?)/g, (m, letter, num) => {
    if (letter) { cmd = letter; axis = 0; return letter }
    const v = parseFloat(num)
    const isX = cmd === 'H' ? true : cmd === 'V' ? false : axis % 2 === 0
    axis++
    return String(round(isX ? v + dx : v))
  })
}

/**
 * Shaped text as INDIVIDUAL glyph outlines, each with its position along the
 * baseline.
 *
 * For text that follows a curve. The string is shaped once, as a whole, so
 * Arabic joining and ligatures are resolved exactly as they would be on a
 * straight line; only the placement of the finished glyphs changes afterwards.
 * Shaping word by word and rotating each word as a block — which is what a
 * naive arc routine does — swings the ends of every word off the curve, and the
 * longer the word the worse it reads.
 */
export function textToGlyphs(text, { fontFile, size = 100, baseDir = 'rtl', language, weight }) {
  const runs = splitRuns(text, baseDir)
  const visual = baseDir === 'rtl' ? [...runs].reverse() : runs
  const out = []
  let x = 0

  for (const run of visual) {
    const { font, upem, glyphs } = shapeRun(run.text, {
      fontFile, weight, direction: run.dir,
      script: run.dir === 'rtl' ? 'Arab' : 'Latn',
      language: language ?? (run.dir === 'rtl' ? 'ar' : 'en'),
    })
    const s = size / upem
    let penX = 0
    for (const g of glyphs) {
      const raw = font.glyphToPath(g.g ?? g.glyphId ?? g.codepoint)
      const adv = (g.xAdvance ?? g.ax ?? 0) * s
      if (raw) {
        out.push({
          d: bake(raw, 0, (g.yOffset ?? 0) * -s, s),   // at the origin, on the baseline
          x: x + (penX + (g.xOffset ?? 0)) * s,
          adv,
        })
      }
      penX += g.xAdvance ?? g.ax ?? 0
    }
    x += penX * s
  }

  return { glyphs: out, width: x }
}
