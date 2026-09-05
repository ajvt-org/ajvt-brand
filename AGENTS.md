# Working on this repository

For coding agents, and for anyone arriving without the history.
[README.md](README.md) is the authority on what the repository is and how to run
it; this file is the map of where the rules live and the traps a plausible
answer walks into.

## The one rule

**Nothing in a `dist/` directory is edited, ever.** Not `logos/dist/`, not
`dist/`, not `brand/tokens/tokens.css`. They are build output. A change made
there disappears on the next build and, worse, looks correct until it does.

If a mark is wrong, the fix is in `brand/entities.yml`, `logos/src/symbol.svg`,
`logos/src/glyphs/` or `brand/tokens/`. If a document is wrong, it is in
`templates/documents/theme/document.css` or the document's own front matter.

## Where things are decided

| Decision | File |
| --- | --- |
| Every colour | `brand/tokens/color.json` |
| Which typefaces are active | `brand/tokens/type.json` → `active` |
| Clear space, minimum sizes, page geometry | `brand/tokens/space.json` |
| Which marks exist, and their wordmarks and accents | `brand/entities.yml` |
| What a document looks like | `templates/documents/theme/document.css` |
| What a deck looks like | `templates/presentations/theme/ajvt.css` |
| What a card looks like | `templates/social/components/card.css` + the card's own folder |

## Traps

**Harfbuzz does not do bidi.** It shapes one run in one direction. Passing
`"تحت 18 سنة (U18)"` as a single right-to-left run reverses the digits and the
mark reads `"تحت 81 سنة (81U)"`. It still looks like Arabic to anyone who does
not read it, so it ships. Always go through `textToPathBidi`, never
`textToPath`, for anything a person will read.

**YAML turns an unquoted date into a Date at UTC midnight.** Reading it back
with local-time getters lands on the previous day anywhere west of UTC, which
includes Mauritania. `2026-08-01` becomes "31 July". Always format dates in UTC
— `formatDate` in `tools/build-docs.mjs` and `timeZone: 'UTC'` in
`tools/lib/card.mjs` exist for exactly this.

**The Google Fonts CSS API serves per-script subsets.** Downloading by weight
keeps only the last subset and silently strips the Arabic glyphs. `fonts:fetch`
pulls complete `.ttf` files from the upstream `google/fonts` repository instead.
Do not "simplify" it back to the CSS API.

**A Marp theme cannot `@import` local files.** The import fails silently and the
deck renders as unstyled black text on white — no error, just a bad deck.
`tools/build-decks.mjs` assembles a self-contained theme for this reason.

**Source artwork contains no bare hex codes and no `<text>`.** Colours are
`var(--token, #fallback)`, resolved per variant by the build; a hard-coded
colour survives into the one-ink variants and ruins them. The fallback is there
so the file previews correctly in an editor rather than rendering solid black —
a bare placeholder is an invalid colour, and a black mark reads as a broken file
rather than a template. `npm run check` verifies every fallback still matches
its colour-variant value, so the preview cannot drift from the build. Type is set by the engine, because baked-in
text cannot be resized, recoloured or translated — which is the flaw in the
original raster logo this repository replaces. `npm run check` enforces both.

**`p()` prefixes the repository root.** Passing it an already-absolute path
produces a doubled path. Use `join()` for paths you already resolved.

## House rules

- **Comments explain why, not what.** The token files and `entities.yml` are
  read by people who will never open the build; their comments are the
  documentation and are worth the space. Build scripts get a header explaining
  what would otherwise be surprising.
- **The registry is validated strictly.** It is edited by whoever needs a new
  logo. A typo in an accent name must stop the build with a sentence they can
  act on, not quietly emit the wrong colour.
- **Both languages, always.** Every mark has `name.ar` and `name.fr`. Arabic is
  primary and right to left.
- **One renderer.** The studio's preview and the CLI's output come from the same
  function. Do not add a second rendering path; a preview that can drift from
  the output will.

## Committing

`logos/dist/` is committed on purpose — a printer or a member needs a logo file
without installing Node. Everything else generated is ignored. Run
`npm run check` before opening a pull request.
