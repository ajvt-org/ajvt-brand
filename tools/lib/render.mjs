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

/** Self-hosted @font-face rules, inlined so a rendered page never waits on the network. */
let fontCss
export function fontFaceCss() {
  if (fontCss !== undefined) return fontCss
  const f = p('brand/tokens/fonts.css')
  fontCss = existsSync(f)
    ? readFileSync(f, 'utf8').replace(/url\("\.\.\/fonts\//g, `url("file://${p('brand/fonts')}/`)
    : ''
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
export async function svgToPng(svg, { width, background = null } = {}) {
  if (!/<text[\s>]/.test(svg)) {
    let img = sharp(Buffer.from(svg), { density: 400 }).resize({ width: Math.round(width) })
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

/** Chrome stamps every PDF it writes with the wall-clock time of the run, so an
 *  otherwise byte-identical rebuild comes back with 243 files changed and six
 *  bytes differing in each. That is the whole of the difference: the dates sit
 *  uncompressed in the Info dictionary, and rewriting only their fourteen digits
 *  leaves the file the same length, so every xref offset stays valid.
 *
 *  Committed output has to be reproducible -- logos/dist is in the repository so
 *  that a printer or a member can take a file without installing Node, and a
 *  build that dirties the tree every time makes a real change impossible to see. */
const PDF_DATE = '19700101000000'
const datePattern = /(\/(?:CreationDate|ModDate)\s*\(D:)\d{14}/g
function undate(buf) {
  return Buffer.from(buf.toString('latin1').replace(datePattern, `$1${PDF_DATE}`), 'latin1')
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
  return undate(buf)
}

/** Full HTML document to PDF — documents, decks, anything paginated. */
export async function htmlToPdf(html, { baseUrl = `file://${p('.')}/`, format = 'A4', margin, landscape = false } = {}) {
  const b = await getBrowser()
  const page = await b.newPage()
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  const buf = await page.pdf({
    format, landscape, printBackground: true,
    margin: margin ?? { top: '0', bottom: '0', left: '0', right: '0' },
  })
  await page.close()
  return undate(buf)
}

/** Full HTML document to a PNG of an exact size — social cards. */
export async function htmlToPng(html, { width, height, scale = 2 } = {}) {
  const b = await getBrowser()
  const page = await b.newPage({ viewport: { width, height }, deviceScaleFactor: scale })
  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  const buf = await page.screenshot({ type: 'png' })
  await page.close()
  return buf
}
