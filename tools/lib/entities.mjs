import { readFileSync, existsSync } from 'node:fs'
import { parse } from 'yaml'
import { p } from './paths.mjs'

const KINDS = ['association', 'organ', 'committee', 'event', 'team']

/**
 * Where a mark's files land, derived from its kind.
 *
 * The association sits at the top because there is one of it and it is what
 * people come looking for; everything else is grouped, so events never mix in
 * with committees. Nothing writes a path by hand — read `entity.dir`.
 */
const GROUP = {
  association: '',
  organ: 'organs',
  committee: 'committees',
  event: 'events',
  team: 'teams',
}
const LAYOUTS = ['symbol', 'roundel', 'roundel-motto', 'roundel-name', 'horizontal', 'vertical', 'wordmark', 'badge', 'seal', 'favicon']

/**
 * Reads brand/entities.yml, applies the shared defaults and validates.
 *
 * Validation is strict on purpose. This file is edited by whoever needs a new
 * logo, which over time means people who have never opened the build. A typo in
 * an accent name should stop the build with a sentence they can act on, not
 * quietly emit a mark in the wrong colour.
 */
export function loadEntities(tokens) {
  const doc = parse(readFileSync(p('brand/entities.yml'), 'utf8'))
  const { meta, defaults, entities } = doc

  if (!Array.isArray(entities)) throw new Error('entities.yml: `entities` must be a list')

  const seen = new Set()
  const out = entities.map((raw) => {
    const e = { ...defaults, ...raw }
    const where = `entities.yml: "${raw.id ?? '(no id)'}"`

    if (!e.id) throw new Error(`${where} has no id`)
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id)) throw new Error(`${where}: id must be kebab-case`)
    if (seen.has(e.id)) throw new Error(`${where}: duplicate id`)
    seen.add(e.id)

    if (!KINDS.includes(e.kind)) throw new Error(`${where}: kind "${e.kind}" is not one of ${KINDS.join(', ')}`)
    if (!e.name?.ar || !e.name?.fr) throw new Error(`${where}: needs name.ar and name.fr — every mark is bilingual`)
    if (!e.wordmark?.ar?.main) throw new Error(`${where}: needs wordmark.ar.main`)
    if (!tokens.accents[e.accent]) {
      throw new Error(`${where}: accent "${e.accent}" is not in color.json → accents (have: ${Object.keys(tokens.accents).filter(k => !k.startsWith('$')).join(', ')})`)
    }

    e.layouts ??= ['horizontal', 'vertical', 'symbol']
    for (const l of e.layouts) {
      if (!LAYOUTS.includes(l)) throw new Error(`${where}: layout "${l}" is not one of ${LAYOUTS.join(', ')}`)
    }
    if (e.layouts.includes('roundel-motto') && !e.motto?.ar) {
      throw new Error(`${where}: asks for roundel-motto but has no motto.ar`)
    }
    if (e.layouts.includes('badge') && !e.glyph && !e.mark && e.kind !== 'association') {
      throw new Error(`${where}: a badge needs a glyph — add logos/src/glyphs/<name>.svg and set glyph:`)
    }
    // An event may carry its own artwork instead of the mosque. Glyph and mark
    // are alternatives: a glyph is set INTO the mosque, a mark replaces it, and
    // an entity asking for both is describing two different logos.
    if (e.mark) {
      if (e.glyph) throw new Error(`${where}: has both glyph and mark — a glyph goes into the mosque, a mark replaces it; pick one`)
      if (!existsSync(p('logos/src/marks', `${e.mark}.svg`))) {
        throw new Error(`${where}: mark "${e.mark}" has no file at logos/src/marks/${e.mark}.svg`)
      }
    }

    e.accentColor = tokens.accents[e.accent]
    e.archived = e.status === 'archived'
    e.group = GROUP[e.kind]
    e.dir = e.group ? `${e.group}/${e.id}` : e.id
    return e
  })

  const primary = out.filter((e) => e.primary)
  if (primary.length !== 1) throw new Error(`entities.yml: exactly one entity must be primary: true (found ${primary.length})`)
  const parent = primary[0]

  // Every mark but the association endorses itself with the association's name.
  // Defaulting it here rather than repeating it per entity is what keeps the two
  // languages saying the same thing: written out eight times each, they drifted,
  // and the French had become an acronym while the Arabic carried the name.
  const endorsement = parent.endorsement
  if (!endorsement?.ar || !endorsement?.fr) {
    throw new Error(`entities.yml: "${parent.id}" needs endorsement.ar and endorsement.fr — every other mark's eyebrow defaults to it`)
  }
  for (const e of out) {
    if (e === parent) continue
    for (const locale of ['ar', 'fr']) {
      const wm = e.wordmark?.[locale]
      if (wm && wm.eyebrow === undefined) wm.eyebrow = endorsement[locale]
    }
  }

  return { meta, entities: out, primary: parent }
}

export const active = (list) => list.filter((e) => !e.archived)
