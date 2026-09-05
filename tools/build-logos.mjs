#!/usr/bin/env node
/**
 * Generates every logo file the association will ever hand to anyone.
 *
 *   logos/dist/<entity>/<layout>-<locale>-<variant>.svg
 *                       ...                     .png   (at each size)
 *                       ...                     .pdf
 *
 * The whole set is regenerated from scratch every run. Nothing here is edited
 * by hand, so nothing here can drift from brand/entities.yml — which is the
 * point. If a file in logos/dist looks wrong, fix the registry or the symbol
 * and rebuild; do not patch the output.
 */
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { p } from './lib/paths.mjs'
import { loadTokens } from './lib/tokens.mjs'
import { loadEntities } from './lib/entities.mjs'
import { buildLockup } from './lib/lockup.mjs'
import { svgToPng, svgToPdf, closeBrowser } from './lib/render.mjs'

const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]
const skipRaster = process.argv.includes('--svg-only')

const tokens = loadTokens()
const { entities, primary: parent } = loadEntities(tokens)
const minPx = tokens.space.logo['min-size']

// A full run rebuilds from scratch so a removed mark cannot linger. A targeted
// run clears only what it is about to regenerate — wiping everything would
// leave the tree looking as though every other mark had been deleted, and
// `npm run check` would then fail on the marks it just removed.
const onlyEntity = only ? entities.find((e) => e.id === only) : null
if (only && !onlyEntity) throw new Error(`--only=${only} matches no entity in brand/entities.yml`)
if (onlyEntity) rmSync(p('logos/dist', onlyEntity.dir), { recursive: true, force: true })
else rmSync(p('logos/dist'), { recursive: true, force: true })

let files = 0, skipped = 0
const manifest = []

for (const e of entities) {
  if (only && e.id !== only) continue
  const dir = p('logos/dist', e.dir)
  mkdirSync(dir, { recursive: true })

  const locales = ['ar', 'fr']
  for (const layout of e.layouts) {
    for (const locale of locales) {
      // The symbol and the favicon carry no type, so one file serves both
      // languages. Emitting two identical files invites someone to edit one.
      if ((layout === 'symbol' || layout === 'favicon' || layout === 'seal') && locale === 'fr') continue

      for (const variant of e.variants) {
        let svg
        try { svg = buildLockup(e, { layout, locale, variant, tokens, parent }) }
        catch (err) { console.error(`  ! ${e.id}/${layout}-${locale}-${variant}: ${err.message}`); skipped++; continue }

        const base = ['symbol', 'favicon', 'seal'].includes(layout)
          ? `${layout}-${variant}`
          : `${layout}-${locale}-${variant}`

        writeFileSync(p('logos/dist', e.dir, `${base}.svg`), svg)
        files++
        manifest.push({ entity: e.id, kind: e.kind, layout, locale, variant, file: `${e.dir}/${base}.svg` })

        if (skipRaster) continue

        for (const size of e.formats.png ?? []) {
          // Refuse to emit a raster below the size at which the arch fills in
          // and the wordmark stops resolving. A guideline nobody reads cannot
          // prevent a 24px logo; a build that will not produce one can.
          const floor = layout === 'roundel-motto' ? minPx['roundel-motto-screen-px']
                      : layout === 'roundel-name' ? minPx['roundel-name-screen-px']
                      : layout === 'badge' ? minPx['badge-screen-px']
                      : layout === 'symbol' || layout === 'favicon' ? minPx['symbol-screen-px']
                      : minPx['horizontal-screen-px']
          if (size < floor) continue
          const png = await svgToPng(svg, { width: size })
          writeFileSync(p('logos/dist', e.dir, `${base}@${size}.png`), png)
          files++
        }

        if (e.formats.pdf && variant !== 'mono-light') {
          writeFileSync(p('logos/dist', e.dir, `${base}.pdf`), await svgToPdf(svg))
          files++
        }
      }
    }
  }
  process.stdout.write(`  ${e.dir.padEnd(34)} ${e.layouts.join(', ')}\n`)
}

// A targeted run walks one entity, so `manifest` holds that entity's marks and
// nothing else. Writing it straight out drops every other mark from the index:
// the files stay on disk, so the tree looks fine and `npm run check` passes,
// and the loss only surfaces in whatever reads the manifest. So merge instead —
// the rebuilt entity replaces its own entries and every other entity keeps the
// ones already recorded. Rebuilt in registry order, so the file stays
// deterministic and an entity dropped from the registry drops out with it.
const file = p('logos/dist/manifest.json')
let marks = manifest
if (only) {
  const previous = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).marks ?? [] : []
  if (!previous.length) {
    console.error(`  ! nothing in ${file} to merge into — it now lists ${only} alone.`)
    console.error('    Run `npm run build:logos` for a complete index.')
  }
  marks = entities.flatMap((e) => (e.id === only ? manifest : previous.filter((m) => m.entity === e.id)))
}

writeFileSync(file, JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  note: 'Generated by tools/build-logos.mjs. Do not edit files in logos/dist — edit brand/entities.yml and rebuild.',
  marks,
}, null, 2) + '\n')

await closeBrowser()
console.log(`\n${files} files across ${manifest.length} marks` + (skipped ? `, ${skipped} skipped` : ''))
