# Document starters

Copy one into `content/documents/`, rename it with a date prefix, fill it in,
then `npm run build:docs`.

    cp templates/documents/types/decision.md \
       content/documents/2026-10-04-decision-budget.md

The front matter is the whole interface. `layout` picks the furniture,
`lang` picks direction and typeface, `entity` picks whose mark appears. You never
touch styling — that lives in `templates/documents/theme/document.css`, once, for
every document ever written.

| Starter | Layout | For |
| --- | --- | --- |
| `decision.md` | cover | قرار — a decision of the Assemblée générale or the Bureau |
| `reglement.md` | cover | نظام داخلي — rules governing an event or a body |
| `termes-de-reference.md` | letterhead | Termes de référence for a project or partner |
| `proces-verbal.md` | letterhead | محضر — minutes of a meeting |
| `lettre.md` | letterhead | Official correspondence |

## Two keys worth knowing, for anything long

    numbering: true      # the build numbers the parts and the articles
    toc: true            # a contents page, with page numbers, after the cover

**`numbering`** means you write the title of a part or an article and nothing
else — `# الجمعية العامة`, `## تعريف الجمعية العامة` — and the build writes
`الباب الثاني:` and `المادة (12):` in front of them. Insert an article in the
middle of two hundred and the rest renumber themselves. Leave it off for a
document that already carries its numbers in its text, or it will be numbered
twice.

A part marked `{.annex}` is still a numbered part, but its subheadings are not
articles: they take `أولا`, `ثانيا` and then `1.`, `2.` restarting under each.
`{.unnumbered}` opts a single heading out, and `{data-label="ملحق"}` prints a
small label in the corner of the part's band.

**`toc`** builds the contents from those same headings. The page numbers are
read back off the rendered PDF, which needs `pdftotext`; without it the contents
page is still built, and still links, but carries no numbers. The build says so
when that happens.
