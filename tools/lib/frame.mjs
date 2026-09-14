import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { p } from './paths.mjs'
import { loadTokens } from './tokens.mjs'
import { loadEntities } from './entities.mjs'
import { render, stripLayoutComment } from './template.mjs'
import { fontFaceCss, htmlToPng } from './render.mjs'
import { formats } from './card.mjs'

/**
 * Frames — furniture laid OVER a photograph, not a card.
 *
 * The difference that shapes this file: a card is composed of values someone
 * types, a frame is composed of nothing at all. Every string on a frame comes
 * out of brand/entities.yml, so the competition cannot be misspelled on a
 * matchday and the association's endorsement cannot drift from the one the
 * lockups use. There is deliberately no `data` argument.
 *
 * The output is a transparent PNG at the photograph's own dimensions. See
 * logos/dist/frames/README.md for what a committee member does with it.
 */

export function listFrames() {
  const dir = p('templates/social/frames')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((d) => existsSync(p('templates/social/frames', d, 'frame.json')))
    .map((d) => JSON.parse(readFileSync(p('templates/social/frames', d, 'frame.json'), 'utf8')))
}

/** The mark as inline SVG, in colour. A frame sits on a photograph rather than
 *  on a ground of its own, so the one-ink knockout a card uses is wrong here —
 *  there is nothing for it to knock out of. */
function markSvg(dir) {
  const f = p('logos/dist', dir, 'symbol-color.svg')
  if (!existsSync(f)) throw new Error(`no colour symbol at logos/dist/${dir}/symbol-color.svg — run \`npm run build:logos\``)
  return readFileSync(f, 'utf8').replace(/<\?xml[^>]*\?>/, '')
}

export function frameHtml(frameId, { format = 'photo', locale = 'ar' } = {}) {
  const dir = p('templates/social/frames', frameId)
  if (!existsSync(dir)) throw new Error(`no frame template "${frameId}" in templates/social/frames/`)
  const def = JSON.parse(readFileSync(join(dir, 'frame.json'), 'utf8'))
  const tpl = stripLayoutComment(readFileSync(join(dir, 'frame.html'), 'utf8'))

  const tokens = loadTokens()
  const { entities, primary } = loadEntities(tokens)
  const entity = entities.find((e) => e.id === def.entity)
  if (!entity) throw new Error(`${frameId}: frame.json names entity "${def.entity}", which is not in entities.yml`)

  const fmt = formats()[format]
  if (!fmt) throw new Error(`unknown format "${format}"`)

  const values = {
    markCup: markSvg(entity.dir),
    markAjvt: markSvg(primary.dir),
    name: entity.name[locale],
    // The eyebrow every non-parent mark inherits from the association — the
    // short endorsement, not the full registered name, which runs too wide at
    // a size meant to stay quiet.
    org: entity.wordmark?.[locale]?.eyebrow ?? primary.name[locale],
    season: locale === 'ar' ? `موسم ${entity.season}` : `Saison ${entity.season}`,
  }

  return `<!doctype html>
<html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}">
<meta charset="utf-8">
<style>
${fontFaceCss()}
html, body { margin: 0; padding: 0; background: transparent; }
:root {
  --w: ${fmt.w}px;
  --h: ${fmt.h}px;
  --accent-base: ${entity.accentColor.base};
}
${readFileSync(join(dir, 'frame.css'), 'utf8')}
</style>
<body>
${render(tpl, values)}
</body>
</html>`
}

export async function framePng(frameId, { format = 'photo', locale = 'ar', scale } = {}) {
  const fmt = formats()[format]
  // Export at roughly 2000px on the short edge whatever the format declares, so
  // a frame never has to be scaled UP onto a photograph off a modern phone.
  const s = scale ?? Math.max(1, Math.ceil(2048 / fmt.w))
  return htmlToPng(frameHtml(frameId, { format, locale }), {
    width: fmt.w, height: fmt.h, scale: s, omitBackground: true,
  })
}
