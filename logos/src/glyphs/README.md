# Glyphs

One per committee or event that carries a badge. Referenced by `glyph:` in
`brand/entities.yml`.

Rules, so a new glyph sits correctly inside a badge without anyone tuning it:

- **viewBox `0 0 100 100`**, artwork centred, optically balanced rather than
  mathematically centred.
- **Stay inside the 100-unit box, and keep the visual mass near the centre.**
  There is more room than it looks: on a badge the glyph is drawn at 192 units
  inside a ring of 196, and in the symbol at 135 units inside a roundel of 254.
  A drawing that fills the box is fine. Cramping it into a small central circle
  only makes it weaker.
- **`fill="var(--glyph, #b0643e)"` and `var(--glyph-soft, #f2e0d4)` only.** The
  build replaces the whole expression with the committee's accent, so a glyph
  takes its colour from `brand/entities.yml`, never from this file. The fallback
  is only so the glyph previews correctly in an editor — it is a generic copper,
  not any particular committee's colour. No bare hex codes: one would survive
  into the one-ink variant and ruin it.
- **Structural strokes get `stroke-width` ≥ 4** at this scale, or they vanish
  when the badge is printed at its 18 mm minimum. Fine detail inside a shape —
  a microphone's grille, a lens ring — may go to about 2.8; below that it fills
  in and reads as a smudge.
- **No text.** A glyph that needs a word is not a glyph.
