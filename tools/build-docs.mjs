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
import { spawnSync } from 'node:child_process'
import matter from 'gray-matter'
import MarkdownIt from 'markdown-it'
import attrs from 'markdown-it-attrs'
import { p } from './lib/paths.mjs'
import { loadTokens } from './lib/tokens.mjs'
import { loadEntities } from './lib/entities.mjs'
import { render, stripLayoutComment } from './lib/template.mjs'
import { htmlToPdf, fontFaceCss, closeBrowser, canSwapFrontPages } from './lib/render.mjs'

// `attrs` lets a heading carry a class or an attribute — `{.annex}`,
// `{data-label="ملحق"}` — which is how a document says one of its parts is a
// different kind of part without the theme having to know its title.
const md = new MarkdownIt({ html: true, typographer: true, breaks: false }).use(attrs)

const tokens = loadTokens()
const { entities, meta } = loadEntities(tokens)
const byId = Object.fromEntries(entities.map((e) => [e.id, e]))

const LABELS = {
  ar: { date: 'تاريخ الاعتماد:', page: 'صفحة', of: 'من', contents: 'المحتويات', part: 'الباب', article: 'المادة' },
  fr: { date: "Date d'approbation :", page: 'Page', of: 'sur', contents: 'Sommaire', part: 'Titre', article: 'Article' },
}

/* Ordinals for the parts of an instrument. Arabic writes them out — الباب
   الأول, never الباب 1 — and runs out at twenty here, which is four more parts
   than the association's own statute has. Past that the numeral is used, which
   is ugly and correct, rather than a word that might be the wrong one. */
const ARABIC_ORDINALS = [
  'الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن', 'التاسع', 'العاشر',
  'الحادي عشر', 'الثاني عشر', 'الثالث عشر', 'الرابع عشر', 'الخامس عشر',
  'السادس عشر', 'السابع عشر', 'الثامن عشر', 'التاسع عشر', 'العشرون',
]
const ordinal = (n, locale) => (locale === 'ar' ? ARABIC_ORDINALS[n - 1] ?? String(n) : String(n))

/* The adverbial ordinals an annex's sections take — أولا, ثانيا — which are a
   different series from the ones a part takes and are not interchangeable. */
const ARABIC_SECTIONS = ['أولا', 'ثانيا', 'ثالثا', 'رابعا', 'خامسا', 'سادسا', 'سابعا', 'ثامنا', 'تاسعا', 'عاشرا']
const section = (n, locale) => (locale === 'ar' ? ARABIC_SECTIONS[n - 1] ?? String(n) : String(n))

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
 * The signature block, from front matter. A règlement is signed by two or three
 * office holders, so the roles are the document's to declare and the spacing is
 * the theme's to decide.
 *
 *   signatures:
 *     - رئيس اللجنة المنظمة
 *     - { role: رئيس الرابطة, name: ... }
 */
function signatureBlock(list) {
  if (!Array.isArray(list) || !list.length) return ''
  const cells = list
    .map((s) => (typeof s === 'string' ? { role: s } : s))
    .map((s) => `  <div class="signature">
    <div class="signature__role">${s.role ?? ''}</div>
    <div class="signature__line">${s.name ?? ''}</div>
  </div>`)
    .join('\n')
  return `<div class="signatures">\n${cells}\n</div>`
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

/**
 * Wraps each `## Article`/`## المادة` run in .article so the theme can rule them.
 *
 * `# الباب الثاني` ends the run. Splitting on the article heading alone left a
 * part heading inside the article above it, where `page-break-inside: avoid`
 * then carried the heading along and could push half a page of white space
 * ahead of it — the article and the part it opens are not one unbreakable block.
 */
const ARTICLE_H2 = /<h2[^>]*>\s*(?:Article|المادة|البند)/i
function groupArticles(html) {
  if (!ARTICLE_H2.test(html)) return html
  const chunks = html.split(/(?=<h1[^>]*>)/i).flatMap((part) => {
    const [head, ...rest] = part.split(new RegExp(`(?=${ARTICLE_H2.source})`, 'i'))
    return [head, ...rest.map((c) => `<section class="article">${c}</section>`)]
  })
  return chunks.filter(Boolean).join('\n')
}

// No `\b` after the Arabic: a word boundary in a JavaScript regular
// expression is defined on ASCII word characters, so `المادة\b` never matches
// anything and every article silently vanishes from the contents page.
const NAMES_AN_ARTICLE = /^\s*(?:Article|المادة|البند)/i

function addClass(attr, name) {
  return /class="/.test(attr)
    ? attr.replace(/class="([^"]*)"/, `class="${name} $1"`)
    : `${attr} class="${name}"`
}

const hasClass = (attr, name) => new RegExp(`class="[^"]*\\b${name}\\b`).test(attr)

/**
 * Ids on the author's own headings, a `part` class on every `#` heading, the
 * numbering, and the list the table of contents is drawn from. The layout's
 * headings — `.cover__title`, `.doc-title` — never reach here: this runs on the
 * rendered Markdown, before the layout is assembled around it.
 *
 * With `numbering` on, the author writes the title of a part or an article and
 * nothing else, and the number is counted here. That is the whole point: an
 * article inserted in the middle of a statute of two hundred renumbers every
 * article after it, and a document whose numbers are typed by hand is a
 * document nobody dares reorder. It is off by default, because a document that
 * already carries its numbers in the text would otherwise be numbered twice.
 *
 * An annex is still a numbered part — it is one — but its subheadings are not
 * articles. They take the series an annex takes: أولا, ثانيا for its sections
 * and 1, 2, 3 within each, restarting at every section. `{.unnumbered}` opts a
 * heading out.
 */
function outlineOf(html, { numbering = false, locale = 'ar', L } = {}) {
  const items = []
  let n = 0
  let parts = 0
  let articles = 0
  let sections = 0
  let clauses = 0
  let inAnnex = false
  const out = html.replace(/<(h1|h2|h3)([^>]*)>([\s\S]*?)<\/\1>/gi, (m, tag, attr, inner) => {
    const level = Number(tag[1])
    const part = level === 1
    const plain = hasClass(attr, 'unnumbered')
    if (part) {
      inAnnex = hasClass(attr, 'annex')
      sections = 0
      clauses = 0
    }
    if (level === 2) clauses = 0

    let body = inner
    let text = inner.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    const prefix = !numbering || plain ? ''
      : part ? `${L.part} ${ordinal(++parts, locale)}:`
      : inAnnex ? (level === 2 ? `${section(++sections, locale)}:` : `${++clauses}.`)
      : level === 2 ? `${L.article} (${++articles}):`
      : ''
    if (prefix) {
      body = `${prefix} ${inner}`
      text = `${prefix} ${text}`
    }

    const id = `s${++n}`
    if (part || (level === 2 && NAMES_AN_ARTICLE.test(text))) items.push({ part, id, text })
    return `<${tag}${part ? addClass(attr, 'part') : attr} id="${id}">${body}</${tag}>`
  })
  return { html: out, items }
}

/* The placeholder that stands in for a page number until the second pass, and
   the thing that tells the second pass which pages are the contents. It is a
   character no document writes, so a page carrying several of them is the
   contents and nothing else can be. */
const TOC_MARK = '⌁'

/**
 * The contents page. Page numbers are left as a placeholder here and filled in
 * afterwards, once there is a PDF to read them off — see `pageNumbers`.
 */
function tocHtml(items, L) {
  if (!items.length) return ''
  const groups = []
  for (const it of items) {
    if (it.part || !groups.length) groups.push({ part: it.part ? it : null, rows: it.part ? [] : [it] })
    else groups.at(-1).rows.push(it)
  }
  const row = (it, cls) =>
    `<a class="${cls}" href="#${it.id}"><span class="toc__label">${it.text}</span>` +
    `<span class="toc__dots"></span><span class="toc__page" data-page="${it.id}">${TOC_MARK}</span></a>`
  const body = groups
    .map((g) => `<section class="toc__group">${g.part ? row(g.part, 'toc__part') : ''}` +
      (g.rows.length ? `<div class="toc__rows">${g.rows.map((r) => row(r, 'toc__row')).join('')}</div>` : '') +
      `</section>`)
    .join('\n')
  // The back of a title page is blank, so the contents open on a right-hand
  // page when the document is printed and bound. It is one line here rather
  // than a rule in the theme because it belongs to documents that have a
  // contents page, not to every cover ever printed.
  return `<div class="page-blank"></div>\n<nav class="toc"><div class="toc__title">${L.contents}</div>\n${body}\n</nav>`
}

/**
 * The words of a line, in logical order, whatever the PDF did to it.
 *
 * Chrome writes one text run per direction change and pdftotext returns them
 * in visual order, so a single Arabic word can come back as several runs — and
 * back to front. `تعريف` arrives as `يف` then `تعر`. Blanking the marks gives
 * `يفتعر`; replacing them with spaces gives two words that are not words. What
 * restores it is reversing the run order of the whole line and joining: the
 * fragments of each word come back together in the right order, and since the
 * result is only ever compared as a set, the line reading backwards costs
 * nothing.
 */
const BIDI_RUN = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]+/
const PUNCT = /[()[\]{}«»<>:;.,،؛؟?!/\\|"'\u2014\u2013—–-]/g
const wordsOf = (s) =>
  s.split(BIDI_RUN).reverse().join('').replace(PUNCT, ' ').split(/\s+/).filter(Boolean)

/* The same line with every space and stop taken out. pdftotext decides where
   the spaces go from the kerning, and it sometimes puts one inside a word —
   `والمشاركة` comes back as `والمشار كة`. Comparing the spaces away costs no
   precision here, because what is compared is a whole heading. */
const keyOf = (s) => wordsOf(s).join('')

/**
 * Which printed page each heading landed on.
 *
 * Chrome will not say — the paginated layout it prints from is not exposed to
 * anything, and a heading's position in the scrolling layout is not where it
 * ends up once the page breaks are applied. So the PDF is read back instead,
 * and a heading is located by requiring every word of it to appear on one
 * extracted line. Matching whole words rather than substrings is what keeps
 * article (1) from being found inside article (12).
 *
 * The contents pages are skipped before anything is searched. They carry every
 * heading in the document verbatim and they come first, so without this every
 * row of the contents points at the contents.
 *
 * Returns null when `pdftotext` is not installed, and the contents page is
 * then built without page numbers rather than with wrong ones.
 */
function pageNumbers(pdfPath, items) {
  const out = spawnSync('pdftotext', ['-raw', pdfPath, '-'], { encoding: 'utf8', maxBuffer: 1 << 26 })
  if (out.error || out.status !== 0) return null
  const pages = out.stdout.split('\f').map((text) => ({
    contents: (text.match(new RegExp(TOC_MARK, 'g')) ?? []).length > 2,
    lines: text.split('\n').map(keyOf).filter(Boolean),
  }))
  const map = {}
  for (const it of items) {
    const want = keyOf(it.text)
    if (!want) continue
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].contents) continue
      // A part is at the head of its page — every part starts one — which is
      // what stops it being located at body text that mentions it. Two lines,
      // not one, because a part may carry a label above its title.
      // Every line, and every adjacent pair for a heading long enough to wrap.
      // Not the head of the page, even for a part: a part that carries a label
      // is a positioned element and Chrome writes it late, so its band can come
      // out of the PDF after the whole page it opens. Matching the heading
      // whole is what keeps this specific — body text would have to reproduce
      // the entire title, punctuation aside, to be mistaken for it.
      const lines = pages[i].lines
      const pairs = lines.map((l, j) => l + (lines[j + 1] ?? ''))
      if (lines.some((l) => l.includes(want)) || pairs.some((l) => l.includes(want))) {
        map[it.id] = i + 1
        break
      }
    }
  }
  return map
}

const fillPages = (html, map) =>
  html.replace(/(<span class="toc__page" data-page="([^"]+)">)[^<]*/g, (m, open, id) => open + (map[id] ?? ''))

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

  const L = LABELS[locale] ?? LABELS.fr
  const { html: headed, items } = outlineOf(md.render(content), { numbering: fm.numbering === true, locale, L })
  const body = groupArticles(headed)
  const toc = fm.toc === false ? '' : fm.toc ? tocHtml(items, L) : ''

  const layoutSource = stripLayoutComment(readFileSync(layoutFile, 'utf8'))
  const assemble = (tocMarkup) => render(layoutSource, {
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
    toc: tocMarkup,
    signatures: signatureBlock(fm.signatures),
  })

  const footer = footerTemplate({
    left: fm.footer ?? entity.name[locale],
    right: fm.footerRight ?? fm.subtitle ?? fm.title ?? '',
    dir, locale, L,
  })

  const page = (tocMarkup) => `<!doctype html>
<html lang="${locale}" dir="${dir}">
<meta charset="utf-8">
<title>${fm.title ?? name}</title>
<style>
${fontFaceCss()}
${readFileSync(p('brand/tokens/tokens.css'), 'utf8')}
${readFileSync(p('templates/documents/theme/document.css'), 'utf8')}
</style>
<body dir="${dir}">
${assemble(tocMarkup)}
</body>
</html>`

  // A cover is a title page. It carries the mark and the date and it is not
  // page one of the text, so the running footer starts after it — and after the
  // blank verso a contents page brings with it, which would not be blank if it
  // carried a page number.
  const footerFrom = layout === 'cover' ? (toc ? 3 : 2) : 1
  const pdfOpts = { format: 'A4', footer, outline: true, footerFrom }

  const out = p('dist/documents', `${name}.pdf`)
  let html = page(toc)
  let pdf = await htmlToPdf(html, pdfOpts)

  // Second pass, for the page numbers only. The contents page is already at
  // its final length — the placeholder occupies the same fixed-width cell the
  // number will — so filling the numerals in cannot move anything, and the
  // numbers read off the first pass still describe the second.
  let note = ''
  if (toc) {
    writeFileSync(out, pdf)
    const map = pageNumbers(out, items)
    if (map) {
      html = page(fillPages(toc, map))
      pdf = await htmlToPdf(html, pdfOpts)
    } else {
      note = '  (no page numbers — pdftotext is not installed)'
    }
  }

  if (footerFrom > 1 && !canSwapFrontPages()) note += '  (footer on the cover — pypdf is not installed)'

  writeFileSync(p('dist/documents', `${name}.html`), html)
  writeFileSync(out, pdf)
  console.log(`  ${name.padEnd(44)} ${layout}/${locale}  ${(pdf.length / 1024 | 0)} KB${note}`)
}

await closeBrowser()
