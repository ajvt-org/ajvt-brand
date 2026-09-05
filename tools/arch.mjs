#!/usr/bin/env node
/**
 * Recomputes the symbol's arch from brand/tokens/space.json and writes it into
 * logos/src/symbol.svg.
 *
 *   npm run arch
 *
 * The arch is the one piece of the artwork that is pure geometry — two radii and
 * three angles — and it has been retuned enough times to be worth deriving
 * rather than hand-editing. The tokens are the truth; this syncs the drawing to
 * them, and `npm run check` fails if the two drift apart.
 *
 * It edits source artwork, so it is NOT part of `npm run build`. Run it when you
 * change the arch tokens, look at the result, and commit both together.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { p } from './lib/paths.mjs'
import { loadTokens } from './lib/tokens.mjs'

export function archPath(a) {
  const { outer, inner, start, end, taper } = a
  const pt = (t, r) => {
    const rad = (t * Math.PI) / 180
    return [Number((256 + r * Math.sin(rad)).toFixed(2)), Number((256 - r * Math.cos(rad)).toFixed(2))]
  }
  // The inner edge runs the FULL length at `inner`; only the outer edge is
  // pulled back, so the arch stays flush against the panel disc to the very tip.
  const tA = pt(start, inner), tB = pt(end, inner)
  const oA = pt(start + taper, outer), oB = pt(end - taper, outer)
  return `M ${tA[0]},${tA[1]} L ${oA[0]},${oA[1]} A ${outer},${outer} 0 1 1 ${oB[0]},${oB[1]} ` +
         `L ${tB[0]},${tB[1]} A ${inner},${inner} 0 1 0 ${tA[0]},${tA[1]} Z`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tokens = loadTokens()
  const want = archPath(tokens.space.logo.arch)
  const file = p('logos/src/symbol.svg')
  const svg = readFileSync(file, 'utf8')
  const re = /(<path d=")([^"]*)("\s+fill="var\(--arch,)/
  const m = svg.match(re)
  if (!m) throw new Error('could not find the arch path in logos/src/symbol.svg')
  if (m[2] === want) { console.log('  arch already matches the tokens'); process.exit(0) }
  writeFileSync(file, svg.replace(re, `$1${want}$3`))
  console.log(`  arch rewritten from tokens (taper ${tokens.space.logo.arch.taper}°)\n  rebuild with \`npm run build\``)
}
