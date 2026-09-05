import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './paths.mjs'

const read = (f) => JSON.parse(readFileSync(join(ROOT, 'brand/tokens', f), 'utf8'))

// Strip the $-prefixed documentation keys. They exist so the token files teach
// whoever opens them; they must never reach a stylesheet.
const strip = (v) =>
  Array.isArray(v) ? v.map(strip)
  : v && typeof v === 'object'
    ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('$')).map(([k, x]) => [k, strip(x)]))
    : v

/** Follow a dotted path like "palette.mint.700" through an object. */
const at = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj)

export function loadTokens() {
  const color = strip(read('color.json'))
  const type  = strip(read('type.json'))
  const space = strip(read('space.json'))

  // semantic → concrete hex. A template must never reference palette.mint.700
  // directly; it asks for `brand` and a rebrand stays a one-block change.
  const semantic = {}
  for (const [name, ref] of Object.entries(color.semantic)) {
    const hex = at(color, ref)
    if (!hex) throw new Error(`semantic token "${name}" points at "${ref}", which does not exist`)
    semantic[name] = hex
  }

  // active font switch → resolved faces, validated against the catalogue.
  //
  // A role's value is either a catalogue key or the name of ANOTHER role on the
  // same script, which makes it an alias. Aliases are what let the motto follow
  // the content face by default — two faces per script — while still being one
  // word away from a face of its own.
  const fonts = {}
  for (const [script, roles] of Object.entries(type.active)) {
    if (script.startsWith('$')) continue
    fonts[script] = {}
    const named = Object.fromEntries(Object.entries(roles).filter(([k]) => !k.startsWith('$')))

    const resolve = (role, seen = []) => {
      if (seen.includes(role)) throw new Error(`type.active.${script}: role aliases loop — ${[...seen, role].join(' -> ')}`)
      const value = named[role]
      if (type.catalog[value]) return value
      if (value in named) return resolve(value, [...seen, role])
      throw new Error(
        `type.active.${script}.${role} = "${value}" is neither a catalogue face nor another role on ${script}`
      )
    }

    // What a face has to be cleared for, per role. A motto is set text, so it
    // needs a content face, not a display one.
    const needs = { wordmark: 'wordmark', content: 'content', motto: 'content' }

    for (const role of Object.keys(named)) {
      const key = resolve(role)
      const face = type.catalog[key]
      if (!face.scripts.includes(script)) throw new Error(`"${key}" does not set ${script}`)
      const need = needs[role] ?? role
      if (!face.roles.includes(need)) {
        throw new Error(`"${key}" may not be used as a ${role} face — it is cleared for ${face.roles.join(', ')}`)
      }
      fonts[script][role] = { key, role, aliasOf: named[role] === key ? null : named[role], ...face }
    }
  }

  // Event artwork colours. Same reference syntax as `semantic`, resolved here
  // so a bad path fails at load with the name of the offender rather than
  // painting a mark in `undefined`.
  const marks = {}
  for (const [mark, variants] of Object.entries(color.marks ?? {})) {
    marks[mark] = {}
    for (const [variant, slots] of Object.entries(variants)) {
      marks[mark][variant] = Object.fromEntries(Object.entries(slots).map(([slot, ref]) => {
        if (ref === 'none' || ref.startsWith('#')) return [slot, ref]
        const hex = at(color, ref)
        if (!hex) throw new Error(`marks.${mark}.${variant}.${slot} points at "${ref}", which does not exist in color.json`)
        return [slot, hex]
      }))
    }
  }

  return { color, type, space, semantic, fonts, marks, motto: type.motto ?? {}, accents: color.accents, grayscale: color.grayscale }
}

/**
 * The palette a logo variant is drawn with. One entry per placeholder in
 * logos/src/symbol.svg — add a placeholder there, add it in all four variants
 * here, or the build will refuse to emit the file.
 */
/**
 * The one-ink recipe, shared by mono-dark and mono-light.
 *
 * A single-ink mark has to be a SILHOUETTE, not a line drawing. Every surface
 * that carries the shape — shafts, caps, domes — takes the ink; every surface
 * that only carries detail — the ground, the panel, the shading, the ribs, the
 * apertures — drops out entirely. Leaving the shafts empty makes the caps float
 * free of the building, which is what the mark looked like before this existed.
 */
const mono = (ink) => ({
  roundel: 'none', body: 'none', haze: 'none', panel: 'none',
  arch: ink, dome: ink, 'dome-alt': ink, 'dome-shade': 'none',
  tower: ink, shade: 'none', cap: ink, rib: 'none', finial: ink,
  aperture: 'none', 'aperture-soft': 'none', window: 'none', edge: ink,
})

export function symbolPalette(tokens, variant, accentName = 'copper') {
  const p = tokens.color.palette
  const a = tokens.accents[accentName] ?? tokens.accents.copper

  const color = {
    // The body is OPAQUE and the same mint as the ground: it now covers the
    // white panel disc, so a translucent tint would wash the lower half out.
    // In the original the two mints differ by one value per channel.
    roundel: p.mint[200], body: p.mint[200], haze: p.mint[50], panel: '#ffffff',
    arch: a.base, dome: p.copper[400], 'dome-alt': p.copper[400],
    // The shaft is the SAME mint as the roundel, exactly as in the original.
    // It therefore shows only where it crosses the white panel and vanishes
    // against the ground — which is what stops two heavy columns from dominating
    // the mark. The shaded edge is what gives it its form.
    'dome-shade': p.copper[500], tower: p.mint[200], shade: p.mint[300],
    cap: p.cream.base, rib: p.cream.dark, finial: p.khaki.base,
    aperture: '#4b4539', 'aperture-soft': p.mint[300], window: '#ffffff', edge: 'none',
  }

  switch (variant) {
    case 'color': return color
    case 'grayscale': {
      // Fixed conversions from color.json, not a computed desaturation — a
      // one-ink print has to be predictable, and luminance-matching mint and
      // copper by eye beats matching them by formula.
      const g = tokens.grayscale
      return {
        roundel: g['palette.mint.200'], body: g['palette.mint.200'], haze: '#f0f0f0', panel: '#ffffff',
        arch: g['palette.copper.600'], dome: g['palette.copper.500'], 'dome-alt': g['palette.copper.500'],
        'dome-shade': g['palette.copper.600'], tower: g['palette.mint.100'], shade: g['palette.mint.200'],
        cap: '#f2f2f2', rib: '#dcdcdc', finial: '#6e6e6e',
        aperture: '#3a3a3a', 'aperture-soft': g['palette.mint.300'], window: '#ffffff', edge: 'none',
      }
    }
    case 'mono-dark':
      // A single ink on a light ground: stamps, embroidery, engraving, a fax.
      return mono(p.mint[800])
    case 'mono-light':
      // Knockout: one ink reversed out of a dark or photographic ground.
      return mono('#ffffff')
    default: throw new Error(`unknown variant "${variant}"`)
  }
}

/**
 * The palette an EVENT'S OWN artwork is drawn with, from color.json → marks.
 *
 * Kept apart from symbolPalette because the two describe different objects:
 * the mosque has a roundel, an arch and minarets, a trophy has a cup, a ball
 * and a plinth. Sharing one palette would mean every mark carrying every other
 * mark's slots, and a missing slot would stop being an error.
 */
export function markPalette(tokens, variant, mark) {
  const m = tokens.marks[mark]
  if (!m) throw new Error(`mark "${mark}" has no colours — add a "${mark}" block under marks in brand/tokens/color.json`)
  const pal = m[variant]
  if (!pal) throw new Error(`marks.${mark} has no "${variant}" variant — all four must be defined`)
  return pal
}
