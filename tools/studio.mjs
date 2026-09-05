#!/usr/bin/env node
/**
 * THE STUDIO.
 *
 *   npm run studio    ->  http://localhost:4321
 *
 * A form, a live preview and a download button. Someone on the comms committee
 * fills in a score and gets a PNG. No terminal, no JSON, no design tool.
 *
 * The preview is not a browser-side approximation — it is a real render from
 * tools/lib/card.mjs, the same function `npm run build:cards` calls. If the
 * studio drew its own preview the two would drift, and eventually someone would
 * publish a card that did not look like the one they approved.
 */
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { p } from './lib/paths.mjs'
import { listCards, formats, cardPng } from './lib/card.mjs'
import { loadTokens } from './lib/tokens.mjs'
import { loadEntities } from './lib/entities.mjs'
import { closeBrowser } from './lib/render.mjs'

const PORT = Number(process.env.PORT ?? 4321)

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}
const readBody = (req) => new Promise((resolve, reject) => {
  let d = ''
  req.on('data', (c) => { d += c; if (d.length > 2e6) reject(new Error('body too large')) })
  req.on('end', () => { try { resolve(JSON.parse(d || '{}')) } catch (e) { reject(e) } })
})

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  try {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return res.end(readFileSync(p('studio/index.html')))
    }

    if (url.pathname === '/api/catalog') {
      const tokens = loadTokens()
      const { entities } = loadEntities(tokens)
      return json(res, 200, {
        cards: listCards(),
        formats: formats(),
        entities: entities.filter((e) => !e.archived).map((e) => ({ id: e.id, kind: e.kind, name: e.name })),
      })
    }

    if (url.pathname === '/api/render' && req.method === 'POST') {
      const { template, data = {}, format = 'square', locale = 'ar', scale = 1 } = await readBody(req)
      const png = await cardPng(template, data, { format, locale, scale })
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' })
      return res.end(png)
    }

    // Saving keeps the card as data in content/cards/, so a template change can
    // be replayed over everything already published.
    if (url.pathname === '/api/save' && req.method === 'POST') {
      const { name, spec } = await readBody(req)
      if (!/^[\w-]{1,80}$/.test(name ?? '')) return json(res, 400, { error: 'name must be letters, digits, - or _' })
      mkdirSync(p('content/cards'), { recursive: true })
      const file = p('content/cards', `${name}.json`)
      writeFileSync(file, JSON.stringify(spec, null, 2) + '\n')
      return json(res, 200, { saved: `content/cards/${name}.json` })
    }

    res.writeHead(404).end('not found')
  } catch (e) {
    console.error(e)
    json(res, 500, { error: e.message })
  }
})

server.listen(PORT, () => {
  console.log(`\n  AJVT studio  ->  http://localhost:${PORT}\n`)
  if (!existsSync(p('logos/dist/ajvt'))) console.log('  ! logos not built yet — run `npm run build:logos` first\n')
})

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => { await closeBrowser(); server.close(); process.exit(0) })
}
