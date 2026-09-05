import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { p } from './paths.mjs'
import { loadTokens } from './tokens.mjs'
import { loadEntities } from './entities.mjs'
import { render, stripLayoutComment } from './template.mjs'
import { fontFaceCss, htmlToPng } from './render.mjs'

/**
 * ONE renderer, used by the CLI and by the studio.
 *
 * This matters more than it looks: if the studio drew its preview in the
 * browser with its own CSS, the preview and the published PNG would drift, and
 * someone would publish a card that did not look like what they approved. The
 * studio's preview IS a render from this function.
 */

export function listCards() {
  const dir = p('templates/social/cards')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((d) => existsSync(p('templates/social/cards', d, 'card.json')))
    .map((d) => JSON.parse(readFileSync(p('templates/social/cards', d, 'card.json'), 'utf8')))
}

export const formats = () => JSON.parse(readFileSync(p('templates/social/formats.json'), 'utf8'))

// `timeZone: 'UTC'` is not optional. `new Date('2026-09-12')` is UTC midnight,
// and formatting it in local time prints the 11th anywhere west of Greenwich —
// including Mauritania. A match card dated a day early gets published before
// anyone notices.
const LOCALE_DATE = {
  ar: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' },
  fr: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' },
}

function markSvg(entity) {
  for (const c of [`${entity.dir}/horizontal-ar-mono-light.svg`, `${entity.dir}/vertical-ar-mono-light.svg`,
                   `ajvt/horizontal-ar-mono-light.svg`, `ajvt/vertical-ar-mono-light.svg`]) {
    const f = p('logos/dist', c)
    if (existsSync(f)) return readFileSync(f, 'utf8').replace(/<\?xml[^>]*\?>/, '')
  }
  throw new Error('no knockout logo built — run `npm run build:logos`')
}

/** Builds the full HTML document for one card. */
export function cardHtml(cardId, data, { format = 'square', locale = 'ar' } = {}) {
  const dir = p('templates/social/cards', cardId)
  if (!existsSync(dir)) throw new Error(`no card template "${cardId}" in templates/social/cards/`)
  const def = JSON.parse(readFileSync(join(dir, 'card.json'), 'utf8'))
  const tpl = stripLayoutComment(readFileSync(join(dir, 'card.html'), 'utf8'))

  const tokens = loadTokens()
  const { entities } = loadEntities(tokens)
  const entity = entities.find((e) => e.id === (data.entity ?? def.entity)) ?? entities.find((e) => e.primary)

  const fmt = formats()[format]
  if (!fmt) throw new Error(`unknown format "${format}"`)

  // Defaults from the field list, then whatever the caller supplied.
  const values = {}
  for (const f of def.fields) values[f.key] = f.default ?? ''
  for (const [k, v] of Object.entries(data)) if (v !== undefined && v !== null && v !== '') values[k] = v

  // Derived values a template can use without the author computing them.
  if (values.date) {
    const d = new Date(values.date)
    if (!isNaN(d)) values.dateLong = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-MA' : 'fr-FR', LOCALE_DATE[locale]).format(d)
  }
  values.mark = markSvg(entity)

  const accent = entity.accentColor
  const ground = entity.ground ?? tokens.color.palette.mint[800]
  const cardCss = existsSync(join(dir, 'card.css')) ? readFileSync(join(dir, 'card.css'), 'utf8') : ''

  return `<!doctype html>
<html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}">
<meta charset="utf-8">
<style>
${fontFaceCss()}
${readFileSync(p('brand/tokens/tokens.css'), 'utf8')}
:root {
  --w: ${fmt.w}px;
  --h: ${fmt.h}px;
  --ground: ${ground};
  --accent-base: ${accent.base};
  --accent-tint: ${accent.soft};
}
${readFileSync(p('templates/social/components/card.css'), 'utf8')}
${cardCss}
</style>
<body><div class="stage">
${render(tpl, values)}
</div></body>
</html>`
}

export async function cardPng(cardId, data, opts = {}) {
  const fmt = formats()[opts.format ?? 'square']
  return htmlToPng(cardHtml(cardId, data, opts), { width: fmt.w, height: fmt.h, scale: opts.scale ?? 1 })
}
