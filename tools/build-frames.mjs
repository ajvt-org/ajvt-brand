#!/usr/bin/env node
/**
 * Renders every frame in templates/social/frames/.
 *
 *   templates/social/frames/<id>/  ->  logos/dist/frames/<entity>/
 *
 *   node tools/build-frames.mjs          every frame, every shape it declares
 *   node tools/build-frames.mjs corner   just that one
 *
 * Two forms, for two kinds of person:
 *   .svg  vector, correct at any size — for anyone opening a design tool
 *   .png  transparent raster at 4096 on the long edge — for everyone else
 *
 * 4096 is not arbitrary. A frame gets scaled onto whatever a phone shot, and a
 * current phone shoots 4032 wide; an overlay built at 2160 arrives soft, with a
 * blurred hairline and mushy Arabic. Shipping above the photograph means the
 * frame is always scaled DOWN, which costs nothing visible.
 *
 * Output goes to logos/dist rather than dist/ for the same reason the lockups
 * do: a committee member with a photograph has to be able to take the file out
 * of a GitHub download without installing Node.
 */
import { writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { p } from './lib/paths.mjs'
import { listFrames, frameParts, frameSvgFor, framePng } from './lib/frame.mjs'
import { closeBrowser } from './lib/render.mjs'

/** The shapes a photograph actually comes in, longest edge 4096. */
const SHAPES = {
  photo:    { w: 4096, h: 3072, note: '4:3 — straight off a phone or camera' },
  square:   { w: 4096, h: 4096, note: '1:1 — Facebook, Instagram feed, WhatsApp' },
  portrait: { w: 4096, h: 5120, note: '4:5 — Instagram feed, tallest it allows' },
  story:    { w: 2304, h: 4096, note: '9:16 — Instagram and WhatsApp stories' },
  wide:     { w: 4096, h: 2304, note: '16:9 — video stills, YouTube thumbnails' },
}

const only = process.argv[2]
const frames = listFrames().filter((f) => !only || f.id === only)
if (!frames.length) {
  console.log(only ? `  no frame "${only}" in templates/social/frames/` : '  no frames in templates/social/frames/ yet')
}

for (const def of frames) {
  const parts = await frameParts(def.id)
  const out = p('logos/dist/frames', def.entity)
  mkdirSync(out, { recursive: true })

  for (const shape of def.formats) {
    const s = SHAPES[shape]
    if (!s) throw new Error(`${def.id}: frame.json asks for shape "${shape}", which is not one of ${Object.keys(SHAPES).join(', ')}`)

    const svg = frameSvgFor(def.id, { w: s.w, h: s.h, parts })
    writeFileSync(p('logos/dist/frames', def.entity, `${def.id}-${shape}.svg`), svg)

    const png = await framePng(def.id, { w: s.w, h: s.h, parts })
    writeFileSync(p('logos/dist/frames', def.entity, `${def.id}-${shape}.png`), png)

    console.log(`  ${(def.entity + '/' + def.id + '-' + shape).padEnd(44)} ${s.w}x${s.h}  ${(png.length / 1024 | 0)} KB`)
  }
}

// The instructions ship NEXT TO the files, because the person who needs them
// downloads this folder and never sees the repository. Copied on every run:
// `npm run build:logos` deletes logos/dist wholesale before rewriting it, so
// anything left in the output tree by hand disappears on the first rebuild.
const readme = p('templates/social/frames/README.md')
if (frames.length && existsSync(readme)) {
  mkdirSync(p('logos/dist/frames'), { recursive: true })
  copyFileSync(readme, p('logos/dist/frames/README.md'))
}
await closeBrowser()
