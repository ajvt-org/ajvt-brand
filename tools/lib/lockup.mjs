import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { p } from './paths.mjs'
import { textToPathBidi, textToGlyphs, pathBounds } from './text-to-path.mjs'
import { symbolPalette, markPalette } from './tokens.mjs'

/**
 * THE LOCKUP ENGINE.
 *
 * One symbol + one registry entry + one layout name -> a finished SVG.
 *
 * Every mark AJVT owns comes out of here. That is the whole design: a committee
 * logo is not drawn, it is COMPOSED, from artwork that already exists and a
 * wordmark that is typeset on demand. It is why adding the Comité des sports is
 * a ten-line edit to entities.yml, and why changing the symbol updates fourteen
 * marks at once instead of starting fourteen jobs.
 *
 * Geometry is in symbol units: the roundel is 512 across, so 512 == 1 symbol.
 */

const SYM = 512
/**
 * Resolves the artwork's colours for one variant.
 *
 * Source artwork writes `fill="var(--roundel, #c5e8dc)"`. The variable name is
 * what the build binds; the fallback exists ONLY so the file renders correctly
 * when someone opens it in an editor or a browser. A bare `{{token}}` would be
 * an invalid colour and every previewer would draw the mark solid black, which
 * looks like a broken file rather than a template.
 *
 * `npm run check` verifies each fallback still equals its colour-variant value,
 * so the preview cannot quietly drift from what the build actually emits.
 */
const fill = (svg, palette) =>
  svg.replace(/var\(\s*--([\w-]+)\s*,[^)]*\)/g, (m, k) => {
    if (!(k in palette)) throw new Error(`artwork uses var(--${k}), which no variant defines — add it to symbolPalette()`)
    return palette[k]
  })

/**
 * The mosque roundel, stripped of its XML wrapper so it can be nested.
 *
 * Ids are namespaced per instance, or a page holding two lockups has the second
 * silently reuse the first one's clip path. The namespace is a COUNTER, not a
 * random string: logos/dist is committed, so a random id would rewrite all 224
 * files on every build and bury real changes under a meaningless diff.
 */
function symbolBody(palette, uid) {
  const raw = readFileSync(p('logos/src/symbol.svg'), 'utf8')
  const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  return fill(inner, palette).replace(/(id|href)="#?([\w-]+)"/g, (m, attr, id) =>
    attr === 'id' ? `id="${uid}-${id}"` : `href="#${uid}-${id}"`
  ).replace(/url\(#([\w-]+)\)/g, `url(#${uid}-$1)`)
}

/**
 * An event's own artwork, in place of the mosque.
 *
 * Same contract as the symbol — 512 units, colours as var() bound at build —
 * so every layout downstream is unchanged and an event still gets the whole
 * set of lockups without a line of layout code being written for it.
 */
function markBody(name, palette, uid) {
  const file = p('logos/src/marks', `${name}.svg`)
  if (!existsSync(file)) throw new Error(`mark "${name}" not found at logos/src/marks/${name}.svg`)
  const raw = readFileSync(file, 'utf8')
  const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  return fill(inner, palette).replace(/(id|href)="#?([\w-]+)"/g, (m, attr, id) =>
    attr === 'id' ? `id="${uid}-${id}"` : `href="#${uid}-${id}"`
  ).replace(/url\(#([\w-]+)\)/g, `url(#${uid}-$1)`)
}

function glyphBody(name, palette) {
  const file = p('logos/src/glyphs', `${name}.svg`)
  if (!existsSync(file)) throw new Error(`glyph "${name}" not found at logos/src/glyphs/${name}.svg`)
  const raw = readFileSync(file, 'utf8')
  const inner = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  return fill(inner, palette)
}

/* ── Typesetting ─────────────────────────────────────────────────────────── */

/**
 * The file to shape a wordmark with, and the weight to shape it at.
 *
 * A static file carries its weight in the outlines, so nothing more is needed.
 * A VARIABLE file does not: it shapes at its default instance — Regular — until
 * the axis is set. Returning the weight alongside the file is what stops a
 * wordmark declared at 700 from quietly coming out at 400.
 */
function wordmarkFont(tokens, locale) {
  const script = locale === 'ar' ? 'arabic' : 'latin'
  const face = tokens.fonts[script].wordmark
  const dir = p('brand/fonts', face.key)
  if (!existsSync(dir)) throw new Error(`${face.family} is not vendored — run \`npm run fonts:fetch\``)
  const ttfs = readdirSync(dir).filter((f) => f.endsWith('.ttf'))
  const want = face['wordmark-weight'] ?? 700
  const named = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium',
                  600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' }

  const staticFile = ttfs.find((f) => f.includes(`-${named[want]}.`))
  if (staticFile) return { fontFile: p('brand/fonts', face.key, staticFile) }

  const variable = ttfs.find((f) => f.includes('['))
  if (variable) return { fontFile: p('brand/fonts', face.key, variable), weight: want }

  return { fontFile: p('brand/fonts', face.key, ttfs.find((f) => f.includes('-Bold.')) ?? ttfs[0]) }
}

/**
 * The wordmark block: a small eyebrow line over the name.
 *
 * Returned already positioned with its own origin at top-left, so a layout only
 * has to translate it. `align` is which edge the two lines agree on — the
 * reading edge, so right for Arabic and left for French.
 */
export function wordmarkBlock(entity, {
  tokens, locale, size = 64, align = locale === 'ar' ? 'right' : 'left', color,
  // The roundel sets these tighter: inside the mark the space is shallow, and a
  // generous eyebrow gap there costs the name a third of its size.
  browRatio = 0.40, gapRatio = 0.26,
}) {
  const wm = entity.wordmark?.[locale]
  if (!wm) throw new Error(`${entity.id} has no wordmark.${locale}`)
  // Bidi-aware: a wordmark like "تحت 18 سنة (U18)" mixes scripts, and shaping it
  // as one right-to-left run silently reverses the digits.
  const opts = { ...wordmarkFont(tokens, locale), baseDir: locale === 'ar' ? 'rtl' : 'ltr' }

  const mainSize = size
  const browSize = size * browRatio
  const gap = size * gapRatio

  const main = textToPathBidi(wm.main, { ...opts, size: mainSize })
  const brow = wm.eyebrow ? textToPathBidi(wm.eyebrow, { ...opts, size: browSize }) : null

  const width = Math.max(main.width, brow?.width ?? 0)
  const browH = brow ? browSize : 0
  const height = browH + (brow ? gap : 0) + mainSize

  // x offset that puts each line on the shared reading edge
  const edge = (w) => (align === 'right' ? width - w : align === 'center' ? (width - w) / 2 : 0)

  const parts = []
  if (brow) {
    parts.push(`<path d="${brow.d}" fill="${color.eyebrow}" transform="translate(${r(edge(brow.width))} ${r(browSize * 0.80)})"/>`)
  }
  parts.push(`<path d="${main.d}" fill="${color.main}" transform="translate(${r(edge(main.width))} ${r(browH + (brow ? gap : 0) + mainSize * 0.80)})"/>`)

  // Ink extents, as distinct from the em box. An em box overstates how tall a
  // word is — Arabic at 62 em units draws about 42 units of ink — so a layout
  // fitting by em box makes the wordmark far smaller than the space allows.
  const browBase = browSize * 0.80
  const mainBase = browH + (brow ? gap : 0) + mainSize * 0.80
  const tops = [mainBase + main.bounds.minY]
  const bottoms = [mainBase + main.bounds.maxY]
  if (brow) { tops.push(browBase + brow.bounds.minY); bottoms.push(browBase + brow.bounds.maxY) }
  const inkTop = Math.min(...tops)
  const inkBottom = Math.max(...bottoms)

  return {
    svg: parts.join('\n    '), width, height,
    ink: { top: inkTop, bottom: inkBottom, height: inkBottom - inkTop },
  }
}

/**
 * The file and weight for any typeset role — `content`, `motto`, and so on.
 *
 * Which face a role resolves to is decided in brand/tokens/type.json, including
 * whether it has a face of its own or simply follows another role. Nothing here
 * names a family, so changing the motto's face is a one-word edit to that file.
 */
function faceFor(tokens, locale, role, weight = 700) {
  const script = locale === 'ar' ? 'arabic' : 'latin'
  const face = tokens.fonts[script][role]
  if (!face) throw new Error(`no "${role}" face is active for ${script} — see brand/tokens/type.json`)
  const dir = p('brand/fonts', face.key)
  if (!existsSync(dir)) throw new Error(`${face.family} is not vendored — run \`npm run fonts:fetch\``)
  const ttfs = readdirSync(dir).filter((f) => f.endsWith('.ttf'))
  const named = { 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' }

  const exact = ttfs.find((f) => f.includes(`-${named[weight]}.`))
  if (exact) return { fontFile: p('brand/fonts', face.key, exact) }
  const variable = ttfs.find((f) => f.includes('['))
  if (variable) return { fontFile: p('brand/fonts', face.key, variable), weight }
  return { fontFile: p('brand/fonts', face.key, ttfs.find((f) => f.includes('-Bold.')) ?? ttfs[0]) }
}

const r = (n) => Number(n.toFixed(2))

/**
 * Stable id namespace from a string. djb2, base36, NOT truncated — slicing it
 * to five characters collided across the mark set, which would let two lockups
 * on one page share a clip path.
 */
function shortHash(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0
  return 'i' + h.toString(36)
}


/**
 * Text set along a circular arc, one glyph at a time.
 *
 * Each glyph is placed at its own point on the curve and rotated to the tangent
 * there, which is what a text-on-a-path renderer does. The string is shaped as a
 * whole first, so Arabic joining is already resolved and only the placement
 * changes — the per-glyph angular step is small enough that the joins hold.
 *
 * `center` is the angle the run is centred on, clockwise from the top, so 0 is
 * the crown and 180 the base. `flip` turns the glyphs to stay upright along the
 * bottom of a circle, where unflipped text would read upside down.
 */
export function textOnArc(text, { tokens, locale, radius, size, color, center = 0, sweep = 150, flip = false, face = 'wordmark', weight, align = 'baseline' }) {
  const font = face === 'wordmark' ? wordmarkFont(tokens, locale) : faceFor(tokens, locale, face, weight ?? 700)
  const base = { ...font, baseDir: locale === 'ar' ? 'rtl' : 'ltr' }
  const perUnit = (180 / Math.PI) / radius        // degrees of arc per unit of advance

  let { glyphs, width } = textToGlyphs(text, { ...base, size })
  // Shrink to fit rather than cram: an over-long run would otherwise wrap past
  // its sweep and collide with itself.
  if (width * perUnit > sweep) {
    size = size * (sweep / (width * perUnit))
    ;({ glyphs, width } = textToGlyphs(text, { ...base, size }))
  }

  const span = width * perUnit
  // Glyphs come back in visual order with x growing to the right. Which way that
  // maps onto the angle depends on which side of the circle we are on: along the
  // TOP, moving right means increasing angle; along the flipped BOTTOM it means
  // decreasing. Using one direction for both silently mirrors the other — the
  // text still draws, it just reads backwards.
  const dir = flip ? -1 : 1
  const start = center - (dir * span) / 2
  // Where the ink sits relative to `radius`.
  //
  // `center` puts the middle of the INK on the radius, which is what a run
  // inside a ringed band needs. Positioned by baseline instead, the ink sits off
  // to one side and a ring draws straight through the letters.
  let dy
  if (align === 'center') {
    let top = Infinity, bottom = -Infinity
    for (const g of glyphs) {
      const b = pathBounds(g.d)
      if (b.minY < top) top = b.minY
      if (b.maxY > bottom) bottom = b.maxY
    }
    dy = isFinite(top) ? -(top + bottom) / 2 : 0
  } else {
    dy = flip ? -size * 0.30 : size * 0.34
  }

  return glyphs.map((g) => {
    const a = start + dir * (g.x + g.adv / 2) * perUnit
    const rad = ((a - 90) * Math.PI) / 180
    const x = radius * Math.cos(rad)
    const y = radius * Math.sin(rad)
    return `<g transform="translate(${r(x)} ${r(y)}) rotate(${r(a + (flip ? 180 : 0))})">` +
           `<path d="${g.d}" fill="${color}" transform="translate(${r(-g.adv / 2)} ${r(dy)})"/></g>`
  }).join('\n    ')
}

/* ── Layouts ─────────────────────────────────────────────────────────────── */

const inkFor = (variant, tokens, accent) => {
  const p_ = tokens.color.palette
  switch (variant) {
    case 'color':     return { main: p_.mint[700], eyebrow: accent.base, rule: accent.base, motto: accent.deep, glyph: accent.base, 'glyph-soft': accent.soft }
    case 'grayscale': return { main: '#3a3a3a', eyebrow: '#6e6e6e', rule: '#6e6e6e', motto: '#5a5a5a', glyph: '#4a4a4a', 'glyph-soft': '#dcdcdc' }
    case 'mono-dark': return { main: p_.mint[800], eyebrow: p_.mint[800], rule: p_.mint[800], motto: p_.mint[800], glyph: p_.mint[800], 'glyph-soft': 'none' }
    case 'mono-light':return { main: '#ffffff', eyebrow: '#ffffff', rule: '#ffffff', motto: '#ffffff', glyph: '#ffffff', 'glyph-soft': 'none' }
    default: throw new Error(`unknown variant ${variant}`)
  }
}

export function buildLockup(entity, { layout, locale, variant, tokens, parent }) {
  const accent = entity.accentColor
  const pal = symbolPalette(tokens, variant, entity.accent)
  const ink = inkFor(variant, tokens, accent)
  const clear = tokens.space.logo['clear-space'].factor * SYM

  const doc = (w, h, body) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(w)} ${r(h)}" width="${r(w)}" height="${r(h)}" role="img" aria-label="${esc(entity.name[locale])}">\n` +
    `  <title>${esc(entity.name[locale])}</title>\n    ${body}\n</svg>\n`

  /**
   * The mark this entity uses.
   *
   * An entity that declares a glyph gets the mosque with that glyph set in its
   * courtyard — the committee's own symbol, not the association's. The courtyard
   * window is dropped when a glyph is present: two small marks in the same space
   * compete, and the window carries no meaning.
   *
   * The association's own symbol, and the small endorsement inside a badge, use
   * the plain mosque.
   */
  const entitySymbol = (uid) => {
    // An event may bring its own artwork. A committee is the association acting
    // in a particular field, so it wears the mosque with a glyph added; a
    // tournament is a thing the association PUTS ON, it lasts one season, and
    // it is allowed a mark of its own. The palette is what keeps it in the
    // family — see marks in brand/tokens/color.json.
    if (entity.mark) return markBody(entity.mark, markPalette(tokens, variant, entity.mark), uid)
    if (!entity.glyph) return symbolBody(pal, uid)
    const sg = tokens.space.logo['symbol-glyph']
    const scale = sg.size / 100
    return symbolBody({ ...pal, window: 'none', 'aperture-soft': 'none' }, uid) +
      `<g transform="translate(${r(sg.x - sg.size / 2)} ${r(sg.y - sg.size / 2)}) scale(${r(scale, 4)})">` +
      glyphBody(entity.glyph, { glyph: ink.glyph, 'glyph-soft': ink['glyph-soft'] }) + '</g>'
  }

  // Id namespace: deterministic, so a rebuild does not rewrite every file, and
  // unique per mark, so two lockups inlined into the same HTML page — a
  // document, a card, a contact sheet — cannot capture each other's clip path.
  let instance = 0
  const ns = shortHash([entity.id, layout, locale, variant].join('/'))
  const symbolAt = (x, y, scale = 1) =>
    `<g transform="translate(${r(x)} ${r(y)}) scale(${r(scale, 4)})">${entitySymbol(ns + instance++)}</g>`

  switch (layout) {
    /* The mark alone. */
    case 'symbol': {
      const s = SYM + clear * 2
      return doc(s, s, symbolAt(clear, clear))
    }

    /* The mark with the wordmark set into its panel — the historical logo,
       rebuilt so the text is live type rather than baked pixels. */
    /* The roundel, with the association's motto set along the bottom of the
       arch's gap — the historical logo in full. The gap exists for this: the
       arch stops at 120 degrees either side of the bottom precisely so the
       motto can run through it. */
    /* Three roundels, differing only in what runs along the bottom of the
       arch's gap: nothing, the motto, or an organ's name. Only one of the three
       ever appears on a mark, so they share the arc. */
    case 'roundel':
    case 'roundel-motto':
    case 'roundel-name': {
      const s = SYM + clear * 2
      // Fit the wordmark inside the panel's CLEAR area, not the panel path.
      // The minarets and domes are painted over the panel, so a block sized to
      // the panel overlaps them. Constrain on both axes: whichever runs out
      // first decides the scale.
      const safe = tokens.space.logo['panel-safe']
      // roundel-name puts the ASSOCIATION's wordmark in the panel and the
      // organ's name on the arc, so the mark reads "the association, acting as
      // its General Assembly" rather than presenting the organ as its own body.
      const panelOf = layout === 'roundel-name' ? (parent ?? entity) : entity
      const wb = wordmarkBlock(panelOf, {
        tokens, locale, size: 62, align: 'center', color: ink,
        browRatio: 0.34, gapRatio: 0.14,
      })
      // Fit on ink, and centre the ink — not the em box — in the safe area.
      const scale = Math.min(safe.w / wb.width, safe.h / wb.ink.height)
      const gx = clear + safe.x + safe.w / 2 - (wb.width / 2) * scale
      const gy = clear + safe.y + safe.h / 2 - ((wb.ink.top + wb.ink.bottom) / 2) * scale
      let body = symbolAt(clear, clear) +
        `\n    <g transform="translate(${r(gx)} ${r(gy)}) scale(${r(scale, 4)})">\n    ${wb.svg}\n    </g>`

      if (layout === 'roundel-name') {
        const name = entity.wordmark?.[locale]?.main
        if (!name) throw new Error(`${entity.id} has no wordmark.${locale}.main, which the roundel-name lockup needs`)
        // Set STRAIGHT, in the opening the arch leaves at the foot of the
        // roundel — not curved along it. On the arch the name takes the mark's
        // shape and stops reading as words; level and small it reads as a
        // caption naming the body, which is its job.
        const ng = tokens.space.logo['roundel-name']
        const line = textToPathBidi(name, {
          ...wordmarkFont(tokens, locale),
          baseDir: locale === 'ar' ? 'rtl' : 'ltr',
          size: ng.size,
        })
        const fit = Math.min(1, ng['max-width'] / line.width)
        const x = clear + SYM / 2 - (line.width * fit) / 2
        const y = clear + ng.baseline
        body += `\n    <path d="${line.d}" fill="${ink.main}"` +
                ` transform="translate(${r(x)} ${r(y)}) scale(${r(fit, 4)})"/>`
      }

      if (layout === 'roundel-motto') {
        const motto = entity.motto?.[locale]
        if (!motto) throw new Error(`${entity.id} has no motto.${locale}, which the roundel-motto lockup needs`)
        // Everything about how the motto is set lives in the token files: its
        // face and weight in type.json, its place on the roundel in space.json.
        // Nothing about it is decided here.
        const mg = tokens.space.logo.motto
        const c = clear + SYM / 2
        body += `\n    <g transform="translate(${r(c)} ${r(c)})">\n    ` +
          textOnArc(motto, {
            tokens, locale, radius: mg.radius, size: mg.size, sweep: mg.sweep,
            color: ink.motto, center: 180, flip: true,
            face: 'motto', weight: tokens.motto?.weight ?? 700,
          }) +
          `\n    </g>`
      }
      return doc(s, s, body)
    }

    /* Symbol beside the wordmark. The default for a letterhead or a website
       header, and the only lockup that changes side with the language. */
    case 'horizontal': {
      const size = 96
      const wb = wordmarkBlock(entity, { tokens, locale, size, align: locale === 'ar' ? 'right' : 'left', color: ink })
      const gap = SYM * 0.16
      const w = SYM + gap + wb.width + clear * 2
      const h = Math.max(SYM, wb.height) + clear * 2
      const symX = locale === 'ar' ? clear + wb.width + gap : clear
      const txtX = locale === 'ar' ? clear : clear + SYM + gap
      return doc(w, h,
        symbolAt(symX, clear + (h - clear * 2 - SYM) / 2) +
        `\n    <g transform="translate(${r(txtX)} ${r((h - wb.height) / 2)})">\n    ${wb.svg}\n    </g>`)
    }

    /* Symbol over the wordmark. Cover pages, posters, anywhere with height. */
    case 'vertical': {
      const size = 84
      const wb = wordmarkBlock(entity, { tokens, locale, size, align: 'center', color: ink })
      const gap = SYM * 0.12
      const w = Math.max(SYM, wb.width) + clear * 2
      const h = SYM + gap + wb.height + clear * 2
      return doc(w, h,
        symbolAt((w - SYM) / 2, clear) +
        `\n    <g transform="translate(${r((w - wb.width) / 2)} ${r(clear + SYM + gap)})">\n    ${wb.svg}\n    </g>`)
    }

    /* Type alone. For contexts that already show the symbol. */
    case 'wordmark': {
      const size = 110
      const wb = wordmarkBlock(entity, { tokens, locale, size, align: locale === 'ar' ? 'right' : 'left', color: ink })
      const pad = size * 0.4
      return doc(wb.width + pad * 2, wb.height + pad * 2,
        `<g transform="translate(${r(pad)} ${r(pad)})">\n    ${wb.svg}\n    </g>`)
    }

    /* The committee and event pattern: parent endorsement on the top arc, the
       entity's glyph at the centre, its own name on the bottom arc. */
    case 'badge': {
      const R = 256
      const s = (R + clear) * 2
      const c = R + clear
      const bg = tokens.space.logo.badge
      const ground = variant === 'color' ? tokens.color.palette.mint[50]
                   : variant === 'grayscale' ? '#f4f4f4' : 'none'
      const stroke = ink.rule
      const wm = entity.wordmark[locale]

      const body =
        `<g transform="translate(${r(c)} ${r(c)})">` +
        `\n      <circle r="${R}" fill="${ground}"/>` +
        `\n      <circle r="${bg.ring}" fill="none" stroke="${stroke}" stroke-width="${bg['ring-width']}"/>` +
        `\n      <circle r="${bg['inner-ring']}" fill="none" stroke="${stroke}" stroke-width="${bg['inner-ring-width']}"/>` +
        // Parent endorsement on the top arc, the entity's own name on the
        // bottom — the arrangement the existing committee badges already use.
        // Both sit INSIDE the band the rings make and are centred on their ink,
        // so neither ring can cut through the lettering.
        `\n    ${textOnArc(wm.eyebrow ?? entity.name[locale], { tokens, locale, radius: bg['text-radius'], size: bg['top-size'], color: ink.eyebrow, center: 0, sweep: 170, align: 'center' })}` +
        `\n    ${textOnArc(wm.main, { tokens, locale, radius: bg['text-radius'], size: bg['bottom-size'], color: ink.main, center: 180, sweep: 190, flip: true, align: 'center' })}` +
        // The centre: a committee's glyph, or an event's own mark. Beneath it a
        // small parent symbol, so the badge still says AJVT even when the arc
        // type is too small to read.
        `\n      ${entity.mark
          ? `<g transform="translate(-100 -122) scale(0.39)">${markBody(entity.mark, markPalette(tokens, variant, entity.mark), ns + instance++)}</g>`
          : `<g transform="translate(-96 -118) scale(1.92)">${glyphBody(entity.glyph, { glyph: ink.glyph, 'glyph-soft': ink['glyph-soft'] })}</g>`}` +
        `\n      <g transform="translate(-38 76) scale(0.148)">${symbolBody(pal, ns + instance++)}</g>` +
        `\n    </g>`
      return doc(s, s, body)
    }

    /* Small sizes strip the detail that turns to mud below 32px. Note this
       goes through symbolBody like every other layout: inlining the artwork
       directly here skipped the id namespacing, and all four favicon variants
       ended up sharing a bare id="roundel-clip". */
    case 'favicon': {
      // Strip the courtyard window entirely rather than just its glass.
      // Blanking the glass alone left the frame behind as a floating white
      // rectangle — worse at 32px than no window at all.
      const simple = { ...pal, haze: 'none', 'aperture-soft': 'none', window: 'none', rib: 'none', shade: 'none' }
      return doc(SYM, SYM, `<g>${entity.glyph ? entitySymbol(ns + instance++) : symbolBody(simple, ns + instance++)}</g>`)
    }

    /* The official stamp. Reproduced, never restyled. */
    case 'seal': {
      const src = p('logos/src/seal.svg')
      if (!existsSync(src)) throw new Error('logos/src/seal.svg is missing')
      return readFileSync(src, 'utf8')
    }

    default: throw new Error(`unknown layout "${layout}"`)
  }
}

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
