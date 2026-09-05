## Using the mark

**Take a file, do not rebuild one.** Everything in `logos/dist/` is generated
and correct. Redrawing a mark in a design tool, retyping a wordmark, or
exporting a screenshot of one produces something that is nearly right, and
nearly right is how a visual identity dissolves.

**Choose the file, not the crop.** Every lockup is a separate file. Cropping the
horizontal lockup to get a symbol gives the wrong clear space; use the symbol
file.

**Prefer SVG.** It is sharp at any size and it is what a printer wants. Reach
for PNG only where SVG is not accepted.

## What not to do

- Do not change the colours. Four variants are generated; one of them fits.
- Do not stretch, squash, rotate or skew the mark. Scale it proportionally.
- Do not add effects — no shadow, glow, outline, bevel or gradient.
- Do not place the colour or `mono-dark` variant on a dark or busy ground. That
  is what `mono-light` is for.
- Do not put the mark on a background that is close to mint or copper in tone;
  it stops separating from the page.
- Do not re-typeset the wordmark, translate it, or set it in another face.
- Do not enclose the mark in a box, badge or circle of your own. The roundel and
  badge lockups already do this, correctly.
- Do not pair the mark with another logo inside its clear space. Give both room.

## Photographs

Use `mono-light` on a photograph, placed over an area that is dark and quiet.
If no such area exists, lay a dark scrim over the corner first. A mark that
competes with a busy image loses, every time.

## Getting it changed

Nothing in `logos/dist/` is edited. If a mark is wrong, the fix is in
`brand/entities.yml`, `logos/src/symbol.svg` or the token files — change one of
those, run `npm run build`, and every affected file is regenerated together.

Questions go to the Comité de communication — اللجنة الإعلامية.
