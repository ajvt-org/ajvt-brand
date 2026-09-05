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
