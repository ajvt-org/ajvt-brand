#!/usr/bin/env node
/**
 * Renders every frame in templates/social/frames/ to a transparent PNG.
 *
 *   templates/social/frames/<id>/  ->  logos/dist/frames/<entity>/<id>-<format>.png
 *
 *   node tools/build-frames.mjs          every frame, every format it declares
 *   node tools/build-frames.mjs corner   just that one
 *
 * Output goes to logos/dist rather than dist/ for the same reason the lockups
 * do: a committee member with a photograph and a phone has to be able to take
 * the file out of a `git clone` or a GitHub download without installing Node.
 * A frame is more use to that person than any lockup in the tree.
 */
import { writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { p } from './lib/paths.mjs'
import { listFrames, framePng } from './lib/frame.mjs'
import { closeBrowser } from './lib/render.mjs'
import { loadTokens } from './lib/tokens.mjs'
import { loadEntities } from './lib/entities.mjs'

const only = process.argv[2]
const frames = listFrames().filter((f) => !only || f.id === only)

if (!frames.length) {
  console.log(only ? `  no frame "${only}" in templates/social/frames/` : '  no frames in templates/social/frames/ yet')
}

const { entities } = loadEntities(loadTokens())

// The instructions ship NEXT TO the files, because the person who needs them
// downloads this folder from GitHub and never sees the repository. It has to be
// copied on every run: `npm run build:logos` deletes logos/dist wholesale before
// rewriting it, so anything left sitting in the output tree by hand disappears
// the first time somebody rebuilds.
const readme = p('templates/social/frames/README.md')
if (frames.length && existsSync(readme)) {
  mkdirSync(p('logos/dist/frames'), { recursive: true })
  copyFileSync(readme, p('logos/dist/frames/README.md'))
}

for (const def of frames) {
  const entity = entities.find((e) => e.id === def.entity)
  const out = p('logos/dist/frames', def.entity)
  mkdirSync(out, { recursive: true })

  for (const format of def.formats) {
    const png = await framePng(def.id, { format })
    const file = `${def.id}-${format}.png`
    writeFileSync(p('logos/dist/frames', def.entity, file), png)
    console.log(`  ${(def.entity + '/' + file).padEnd(48)} ${(png.length / 1024 | 0)} KB`)
  }
  if (entity) console.log(`  ${def.formats.length} format(s) for ${entity.name.ar}`)
}
await closeBrowser()
