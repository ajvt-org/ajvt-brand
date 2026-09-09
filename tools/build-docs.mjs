#!/usr/bin/env node
/**
 * Markdown in, PDF out.
 *
 *   content/documents/<name>.md   ->   dist/documents/<name>.pdf
 *                                      dist/documents/<name>.html
 *
 * The author writes text and a few lines of front matter. Everything that makes
 * it look like an AJVT paper — the mark, the cover, the running footer, the
 * fonts, the article rules — is applied here from the shared theme. That is the
 * whole point: when the theme changes, every document already written changes
 * with it, and nobody reformats anything.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import matter from 'gray-matter'
import MarkdownIt from 'markdown-it'
import { p } from './lib/paths.mjs'
import { loadTokens } from './lib/tokens.mjs'
import { loadEntities } from './lib/entities.mjs'
import { render, stripLayoutComment } from './lib/template.mjs'
import { htmlToPdf, fontFaceCss, closeBrowser } from './lib/render.mjs'

const md = new MarkdownIt({ html: true, typographer: true, breaks: false })

const tokens = loadTokens()
const { entities, meta } = loadEntities(tokens)
const byId = Object.fromEntries(entities.map((e) => [e.id, e]))

const LABELS = {
  ar: { date: 'تاريخ الاعتماد:', page: 'صفحة', of: 'من' },
  fr: { date: "Date d'approbation :", page: 'Page', of: 'sur' },
}

/**
 * The running footer, drawn in the page margin rather than in the page.
 * Chrome renders this template in its own document, so it inherits nothing —
 * the fonts, the direction and the colours all have to be restated here.
 */
function footerTemplate({ left, right, dir, locale, L }) {
  const face = locale === 'ar' ? 'Amiri' : 'EB Garamond'
  return `<style>${fontFaceCss()}</style>
<div style="width:100%;box-sizing:border-box;padding:0 18mm;margin-top:6mm;font-family:'${face}',serif;font-size:7.5pt;color:#8a8a8a;letter-spacing:0.04em;display:flex;justify-content:space-between;direction:${dir}">
  <span>${left}</span>
  <span>${L.page} <span class="pageNumber"></span> ${L.of} <span class="totalPages"></span></span>
  <span>${right}</span>
</div>`
}

/**
 * YAML turns an unquoted `2026-08-01` into a Date at UTC midnight. Reading it
 * back with local-time getters lands on the previous day for anyone west of
 * UTC, so an approval date silently shifts. Always read it in UTC.
 */
function formatDate(v) {
  if (!v) return ''
  const iso = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)
  const [y, m, d] = iso.split('-')
  return `${d} / ${m} / ${y}`
}

/** Wraps each `## Article`/`## المادة` run in .article so the theme can rule them. */
function groupArticles(html) {
  if (!/<h2[^>]*>\s*(?:Article|المادة|البند)/i.test(html)) return html
  const parts = html.split(/(?=<h2[^>]*>\s*(?:Article|المادة|البند))/i)
  return parts
    .map((chunk, i) => (i === 0 && !/^<h2/i.test(chunk) ? chunk : `<section class="article">${chunk}</section>`))
    .join('\n')
}

function markFor(entity, locale, layout) {
  // A statutory organ signs with the association's mark — its own name is
  // already carried by the org line and the title, and a second wordmark on the
  // same cover reads as two organisations.
  const source = entity.kind === 'organ' ? byId.ajvt.dir : entity.dir
  const candidates = layout === 'cover'
    ? [`${source}/roundel-${locale}-color.svg`, `${source}/badge-${locale}-color.svg`,
       `${source}/vertical-${locale}-color.svg`, `ajvt/roundel-${locale}-color.svg`]
    : [`${source}/horizontal-${locale}-color.svg`, `${source}/badge-${locale}-color.svg`,
       `ajvt/horizontal-${locale}-color.svg`]
  for (const c of candidates) {
    const f = p('logos/dist', c)
    if (existsSync(f)) return readFileSync(f, 'utf8').replace(/<\?xml[^>]*\?>/, '')
  }
  throw new Error(`no logo built for "${entity.id}" — run \`npm run build:logos\` first`)
}

const src = p('content/documents')
mkdirSync(p('dist/documents'), { recursive: true })
const files = existsSync(src) ? readdirSync(src).filter((f) => f.endsWith('.md')) : []

if (!files.length) console.log('  no documents in content/documents/ yet')

for (const file of files) {
  const { data: fm, content } = matter(readFileSync(join(src, file), 'utf8'))
  const name = basename(file, '.md')
  const locale = fm.lang ?? meta['primary-locale'] ?? 'ar'
  const dir = locale === 'ar' ? 'rtl' : 'ltr'
  const entity = byId[fm.entity ?? 'ajvt']
  if (!entity) throw new Error(`${file}: entity "${fm.entity}" is not in brand/entities.yml`)

  const layout = fm.layout ?? 'cover'
  const layoutFile = p('templates/documents/layouts', `${layout}.html`)
  if (!existsSync(layoutFile)) throw new Error(`${file}: no layout "${layout}" in templates/documents/layouts/`)

  const body = groupArticles(md.render(content))
  const L = LABELS[locale] ?? LABELS.fr

  const inner = render(stripLayoutComment(readFileSync(layoutFile, 'utf8')), {
    mark: markFor(entity, locale, layout),
    org: fm.org ?? (entity.kind === 'organ' ? byId.ajvt.name[locale] : entity.name[locale]),
    seat: fm.seat ?? entity.seat?.[locale] ?? byId.ajvt.seat?.[locale] ?? '',
    title: fm.title ?? name,
    subtitle: fm.subtitle ?? '',
    standfirst: fm.standfirst ?? '',
    dateline: fm.dateline ?? '',
    dateLabel: fm.dateLabel ?? L.date,
    date: formatDate(fm.date),
    body,
  })

  const footer = footerTemplate({
    left: fm.footer ?? entity.name[locale],
    right: fm.footerRight ?? fm.subtitle ?? fm.title ?? '',
    dir, locale, L,
  })

  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
<meta charset="utf-8">
<title>${fm.title ?? name}</title>
<style>
${fontFaceCss()}
${readFileSync(p('brand/tokens/tokens.css'), 'utf8')}
${readFileSync(p('templates/documents/theme/document.css'), 'utf8')}
</style>
<body dir="${dir}">
${inner}
</body>
</html>`

  writeFileSync(p('dist/documents', `${name}.html`), html)
  const pdf = await htmlToPdf(html, { format: 'A4', footer })
  writeFileSync(p('dist/documents', `${name}.pdf`), pdf)
  console.log(`  ${name.padEnd(44)} ${layout}/${locale}  ${(pdf.length / 1024 | 0)} KB`)
}

await closeBrowser()
