import { chromium } from 'playwright'
import sharp from 'sharp'
import { readFileSync, existsSync } from 'node:fs'
import { p } from './paths.mjs'

/**
 * Everything that turns HTML or SVG into a file people can use.
 *
 * One browser is launched per build and reused. Rendering is the slow part of
 * this repository — a matchday of twelve cards is twelve page loads — and
 * launching Chrome each time turns seconds into minutes.
 */

let browser
export async function getBrowser() {
  if (browser) return browser
  // Prefer the system Chrome. Playwright's bundled Chromium is a 150 MB
  // download that CI would repeat on every run, and for rendering static
  // pages the two are interchangeable.
  const attempts = [{ channel: 'chrome' }, { channel: 'chromium' }, {}]
  let last
  for (const opts of attempts) {
    try { browser = await chromium.launch({ ...opts, args: ['--font-render-hinting=none'] }); return browser }
    catch (e) { last = e }
  }
  throw new Error(
    `Could not start a browser. Install Chrome, or run \`npx playwright install chromium\`.\n${last?.message ?? ''}`
  )
}

export async function closeBrowser() {
  if (browser) { await browser.close(); browser = null }
}

/** Self-hosted @font-face rules, with every face inlined as a data URI.
 *
 * It has to be a data URI, not a file:// URL. A page built with `setContent`
 * has an about:blank origin, and Chrome refuses to load file:// subresources
 * into one — so a file:// src here fails for every face, SILENTLY: the render
 * still succeeds, Arabic just comes out in whatever sans-serif the machine
 * happens to have, and nobody notices until they compare a PNG against the
 * wordmark. Every generated card, document and frame went out that way.
 *
 * The cost is bounded: fonts.css declares the ACTIVE faces only — the two
 * families in brand/tokens/type.json, about 1.2 MB — and this is read and
 * encoded once per build, then cached here. */
let fontCss
export function fontFaceCss() {
  if (fontCss !== undefined) return fontCss
  const f = p('brand/tokens/fonts.css')
  if (!existsSync(f)) return (fontCss = '')

  const MIME = { woff2: 'font/woff2', woff: 'font/woff', truetype: 'font/ttf', opentype: 'font/otf' }
  const missing = []
  fontCss = readFileSync(f, 'utf8').replace(
    /url\("\.\.\/fonts\/([^"]+)"\)(\s*format\("([^"]+)"\))?/g,
    (whole, rel, fmtClause = '', fmt) => {
      const file = p('brand/fonts', decodeURIComponent(rel))
      if (!existsSync(file)) { missing.push(rel); return whole }
      const b64 = readFileSync(file).toString('base64')
      return `url("data:${MIME[fmt] ?? 'font/ttf'};base64,${b64}")${fmtClause}`
    }
  )
  if (missing.length) {
    throw new Error(
      `brand/tokens/fonts.css points at ${missing.length} font file(s) that are not there:\n  ` +
      `${missing.join('\n  ')}\nRun \`npm run fonts:fetch\`.`
    )
  }
  return fontCss
}

/**
 * PNG at an exact pixel width, transparent unless a background is given.
 *
 * Generated lockups are pure outlined geometry — no <text>, no fonts — so they
 * rasterise correctly through sharp, about ten times faster than a browser
 * screenshot. Across a full rebuild that is the difference between nine minutes
 * and under one, which decides whether people rebuild casually or avoid it.
 *
 * Anything still carrying live type (the seal) needs a real text engine and
 * falls back to the browser.
 */
export async function svgToPng(svg, { width, background = null, density = 400 } = {}) {
  // density is relative to the SVG's own intrinsic size. 400 is right for a
  // lockup, which is 512 units across and has to be scaled UP. An SVG that
  // already declares its size in output pixels — a frame — must be rendered at
  // 96, or sharp is asked for a canvas four times the requested width and
  // refuses with "Input image exceeds pixel limit".
  if (!/<text[\s>]/.test(svg)) {
    let img = sharp(Buffer.from(svg), { density }).resize({ width: Math.round(width) })
    if (background) img = img.flatten({ background })
    return img.png().toBuffer()
  }
  return svgToPngViaBrowser(svg, { width, background })
}

async function svgToPngViaBrowser(svg, { width, background = null } = {}) {
  const b = await getBrowser()
  const page = await b.newPage({ deviceScaleFactor: 1 })
  const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
  const [w, h] = vb ? [parseFloat(vb[1]), parseFloat(vb[2])] : [512, 512]
  const height = Math.round((width * h) / w)

  await page.setViewportSize({ width: Math.round(width), height })
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>
       html,body{margin:0;padding:0;background:${background ?? 'transparent'}}
       svg{display:block;width:${Math.round(width)}px;height:${height}px}
     </style>${svg}`,
    { waitUntil: 'load' }
  )
  const buf = await page.screenshot({ omitBackground: !background, type: 'png' })
  await page.close()
  return buf
}

/** Chrome stamps every PDF it writes with the wall-clock time of the run and
 *  with its own version, so an otherwise byte-identical rebuild comes back with
 *  243 files changed and a handful of bytes differing in each. That is the whole
 *  of the difference: both sit uncompressed in the Info dictionary, and
 *  overwriting digits in place leaves the file the same length, so every xref
 *  offset stays valid. Zeroing rather than deleting is what keeps that true —
 *  a shorter replacement would move every offset after it and break the file.
 *
 *  The version matters as much as the date. A Chrome upgrade on one machine
 *  rewrites the producer string in all 243 files and buries the actual change
 *  in noise, which is exactly what the dates were normalised to prevent.
 *
 *  Committed output has to be reproducible -- logos/dist is in the repository so
 *  that a printer or a member can take a file without installing Node, and a
 *  build that dirties the tree every time makes a real change impossible to see. */
const PDF_DATE = '19700101000000'
const datePattern = /(\/(?:CreationDate|ModDate)\s*\(D:)\d{14}/g
const versionPattern = /((?:HeadlessChrome\/|Chrome\/|Skia\/PDF m)\d*)/g
const zeroDigits = (s) => s.replace(/\d/g, '0')
function normalise(buf) {
  return Buffer.from(
    buf
      .toString('latin1')
      .replace(datePattern, `$1${PDF_DATE}`)
      .replace(versionPattern, zeroDigits),
    'latin1'
  )
}

/** Vector PDF. Chrome embeds the outlined paths; no font is required downstream. */
export async function svgToPdf(svg) {
  const b = await getBrowser()
  const page = await b.newPage()
  const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
  const [w, h] = vb ? [parseFloat(vb[1]), parseFloat(vb[2])] : [512, 512]
  const mm = (px) => `${(px / 512) * 60}mm`   // 512 symbol units == 60 mm
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>
       @page{size:${mm(w)} ${mm(h)};margin:0}
       html,body{margin:0;padding:0}
       svg{display:block;width:${mm(w)};height:${mm(h)}}
     </style>${svg}`,
    { waitUntil: 'load' }
  )
  const buf = await page.pdf({ width: mm(w), height: mm(h), printBackground: true, pageRanges: '1' })
  await page.close()
  return normalise(buf)
}

/** Full HTML document to PDF — documents, decks, anything paginated.
 *
 * `footer` is a running footer for the page margin. A `position: fixed` element
 * cannot do this: Chrome paints it on the first page only, which is how the
 * footer ended up on the cover and nowhere else. The page margin is the one
 * place Chrome repeats, and it is also the only place the page number exists —
 * `.pageNumber` and `.totalPages` are substituted per page. The template renders
 * in its own document, so it inherits nothing from the page and has to carry its
 * own @font-face rules or the Arabic falls back to a system face.
 */
export async function htmlToPdf(html, { baseUrl = `file://${p('.')}/`, format = 'A4', margin, landscape = false, footer } = {}) {
  const b = await getBrowser()
  const page = await b.newPage()
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  const buf = await page.pdf({
    format, landscape, printBackground: true,
    margin: margin ?? { top: '0', bottom: '0', left: '0', right: '0' },
    ...(footer ? { displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: footer } : {}),
  })
  await page.close()
  return normalise(buf)
}

/** Full HTML document to a PNG of an exact size — social cards, and frames.
 *
 * `omitBackground` keeps the alpha channel: a frame is laid over a photograph,
 * so everything the template does not paint has to come out transparent rather
 * than white. */
export async function htmlToPng(html, { width, height, scale = 2, omitBackground = false } = {}) {
  const b = await getBrowser()
  const page = await b.newPage({ viewport: { width, height }, deviceScaleFactor: scale })
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  const buf = await page.screenshot({ type: 'png', omitBackground })
  await page.close()
  return buf
}
