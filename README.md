# ajvt-brand

Visual identity, document, presentation and social templates for **AJVT** —
رابطة شباب قرية التاكلالت, Association des Jeunes de Taguilalett.

Everything here is **generated from source**. There is one drawn artwork file
and one registry; the ~200 logo files, the guidelines pages, the PDFs and the
social cards are all built from them. Nothing in this repository is maintained
by hand twice.

## The idea

A committee logo is not drawn. It is **composed**: the shared symbol, a wordmark
typeset on demand, and an accent colour. So adding the Comité des sports is a
ten-line edit to a YAML file, and changing the symbol updates every mark at once
instead of starting fourteen jobs.

The same idea runs through the documents: authors write Markdown, the house
style lives in one stylesheet, and restyling every décision ever written is a
single change.

## Quick start

```bash
npm install
npm run fonts:fetch     # vendors the active typefaces (~4 MB)
npm run build           # tokens, logos, guidelines, documents, cards
npm run studio          # http://localhost:4321 — make a card without a terminal
```

Requires Node 22+ and Chrome or Chromium. `npm run check` verifies everything
that can be checked without a person looking at it.

## Layout

| Where | What |
| --- | --- |
| `brand/` | **The source of truth.** Tokens, the entity registry, vendored fonts. |
| `logos/src/` | The mosque symbol, the seal, and the committee glyphs. The only drawn artwork. |
| `logos/dist/` | Every generated logo file, grouped by kind. Committed, so anyone can take one without installing Node. |
| `logos/guidelines/` | One generated page per mark. |
| `templates/` | The system: document theme and layouts, deck theme, card templates. |
| `content/` | The instances: the documents, decks and cards actually written. |
| `studio/` | The browser tool the Comité de communication uses. |
| `tools/` | The build. |
| `dist/` | Generated PDFs, decks and card images. |

The `templates` / `content` split is what makes the repository maintainable:
change a template, rebuild, and everything already written is updated.

### Where the marks live

```
logos/dist/ajvt/                    the association
logos/dist/organs/<id>/             statutory bodies — the General Assembly, the
                                    Executive Bureau, the General Secretariat
logos/dist/committees/<id>/         standing committees — health, communication
logos/dist/events/<id>/             events, one folder per edition
logos/dist/teams/<id>/              teams
```

`kind` in the registry decides the folder, so the tree groups itself and an
event can never end up filed among the committees. `logos/guidelines/` mirrors
the same shape.

Identifiers are English and kebab-case — `general-assembly`, not
`assemblee-generale` — so a path reads the same to everyone who opens the
repository, whichever of the two languages they work in. The Arabic and French
names live in `name` and are what actually appears on the mark.

## The three things you will actually do

### Add a logo

Add an entry to [`brand/entities.yml`](brand/entities.yml), drop a glyph in
[`logos/src/glyphs/`](logos/src/glyphs/) if it needs one, and run
`npm run build`. You get every lockup, in colour, grayscale, one-ink and
knockout, as SVG, PNG and PDF, plus a guidelines page — all of it consistent
with every other mark because none of it was drawn.

### Write a document

```bash
cp templates/documents/types/decision.md content/documents/2026-10-04-decision-budget.md
$EDITOR content/documents/2026-10-04-decision-budget.md
npm run build:docs
```

Front matter picks the layout, the language and whose mark appears. You never
touch styling.

### Make a card

`npm run studio`, fill in the form, download the PNG. The preview is a real
render from the same code the build uses, so what you approve is what you get.

## Framing photographs

`npm run build:frames` draws the overlay frames into
`logos/dist/frames/<entity>/`, one PNG per shape. To lay them over a day's
photographs and videos:

```bash
tools/frame-media.py --frames logos/dist/frames/mayor-cup-2026 \
                     --input whatsapp --output whatsapp-framed --recursive
```

Add `--dry-run` first: it prints the frame each file is matched to and what the
match costs, and writes nothing.

The frames are overlays with transparent middles, and they are never stretched
to a shape they were not drawn for — the *picture* is centre-cropped to the
nearest shape instead. Anything more than 15% away from every shape is skipped
rather than mangled, so a panorama comes back untouched and says so.

This is Python, not Node: it needs Pillow, and ffmpeg on `PATH` for video.
Without ffmpeg the photographs still process and the videos are skipped with a
message.

Clips off WhatsApp regularly carry a rotation flag that is simply wrong — the
stored frames are already the right way up, and honouring it lays the picture on
its side. The tool ignores the flag and says so on the file it ignored it for;
that line is worth checking by eye, because no rule can tell a wrong flag from a
genuinely portrait clip.

## Changing the fonts

Two Arabic faces, and no third: one draws wordmarks, one sets content. Both are
chosen in one place.

```bash
npm run font:set                                  # what is active, and the alternatives
npm run font:set arabic.content=noto-naskh-arabic # switch, vendor, rebuild tokens
npm run build
```

Nothing downstream names a font — templates ask for the role, not the family —
so the switch is genuinely one line.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run build` | Tokens, logos, guidelines, documents, cards |
| `npm run build:logos` | Regenerate every mark (add `--svg-only` to skip rasters) |
| `npm run build:docs` | `content/documents/*.md` → PDF |
| `npm run build:decks` | `content/presentations/*.md` → PDF, HTML (`-- --pptx` adds PPTX) |
| `npm run build:cards` | `content/cards/*.json` → PNG |
| `npm run studio` | The card studio |
| `npm run check` | Validate tokens, registry, artwork, licences, output |
| `npm run fonts:fetch` | Vendor the active typefaces |
| `npm run font:set` | Switch a typeface |
| `tools/frame-media.py` | Lay the event frames over photographs and videos (Python; see above) |

## Relationship to ajvt-app

The mint and copper palettes here and in `ajvt-app/src/app/globals.css` are the
same values and must stay identical. `brand/tokens/tokens.css` is generated and
can be imported by the app directly rather than copied.

## Licences

The marks and documents belong to AJVT. The typefaces are SIL Open Font Licence
and are vendored with their licences in `brand/fonts/`.
