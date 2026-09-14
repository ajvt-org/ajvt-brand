/**
 * The Corner frame, as SVG, at any size.
 *
 * PURE ON PURPOSE. This function touches no filesystem and imports nothing, so
 * the same source builds the PNGs here and runs inside the offline compositor
 * in logos/dist/frames/ — the tool a committee member opens to put the frame on
 * a photograph at the photograph's own pixel size. One definition of the
 * geometry, two places it runs; a second copy would drift within a season.
 *
 * Every length derives from the WIDTH (u = w/100), exactly as the cqw units in
 * the browser mock did, so the furniture holds its proportions at 800px or at
 * 6000px. The only thing that keys off height is the foot wash, which has to
 * reach a fixed fraction up the picture whatever shape it is.
 *
 * Text arrives already baked to outlines — see bakeText() in frame.mjs. It has
 * to: Arabic is a joining script, and a <text> element would reshape or fall
 * back to a system face the moment this SVG is opened anywhere else.
 */
export function frameSvg({ w, h, accent = '#c08a1e', ink = '#fdfaf4', text, marks }) {
  const u = w / 100
  const round = (n, dp = 2) => Number(n.toFixed(dp))

  // A baked path sits on the baseline at y=0 and grows rightward from x=0.
  const place = (t, x, baseline, size, opacity = 1) => {
    const s = size / t.em
    return `<path d="${t.d}" transform="translate(${round(x)} ${round(baseline)}) scale(${round(s)})"` +
           ` fill="${ink}"${opacity < 1 ? ` fill-opacity="${opacity}"` : ''} filter="url(#fshadow)"/>`
  }

  /* Placed by INK, not by the file's box. `size` is the height you actually
     see, and `left`/`top` are where that ink starts — so the clear space baked
     into a symbol file stops eating the inset and both marks sit the same
     distance from their corners. */
  const markByInk = (m, size, left, top, align = 'left') => {
    const k = size / m.inkH
    const x = align === 'right' ? left - m.inkW * k - m.inkX * k : left - m.inkX * k
    return `<g transform="translate(${round(x)} ${round(top - m.inkY * k)}) scale(${round(k, 4)})" filter="url(#mshadow)">${m.inner}</g>`
  }

  const MARK = 11      // visible height of each mark, in % of the frame's width
  const inset = 2.1 * u
  const foot = h - 5 * u                       // season and endorsement share this baseline
  const nameSize = 2.6 * u
  const smallSize = 1.6 * u
  const gap = 1.15 * u

  const nameBaseline = foot - smallSize - gap
  const nameInkTop = nameBaseline + text.name.minY * (nameSize / text.name.em)
  const tickH = 0.42 * u
  const tickY = nameInkTop - gap - tickH
  const orgW = text.org.width * (smallSize / text.org.em)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(w)} ${round(h)}" width="${round(w)}" height="${round(h)}">
  <title>كأس عمدة التاكلالت — إطار الصور</title>
  <defs>
    <linearGradient id="fhaze" x1="0" y1="${round(h)}" x2="0" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#10271f" stop-opacity="0.82"/>
      <stop offset="0.15" stop-color="#10271f" stop-opacity="0.3"/>
      <stop offset="0.34" stop-color="#10271f" stop-opacity="0"/>
    </linearGradient>
    <filter id="fshadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="${round(0.16 * u)}" stdDeviation="${round(0.35 * u)}" flood-color="#10271f" flood-opacity="0.72"/>
    </filter>
    <filter id="mshadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="${round(0.22 * u)}" stdDeviation="${round(0.45 * u)}" flood-color="#10271f" flood-opacity="0.55"/>
    </filter>
  </defs>

  <rect x="0" y="0" width="${round(w)}" height="${round(h)}" fill="url(#fhaze)"/>

  <rect x="${round(inset)}" y="${round(inset)}" width="${round(w - 2 * inset)}" height="${round(h - 2 * inset)}"
        fill="none" stroke="#f7f3ee" stroke-opacity="0.62" stroke-width="${round(0.16 * u)}"/>

  ${markByInk(marks.cup, MARK * u, 4.8 * u, 4.8 * u)}
  ${markByInk(marks.ajvt, MARK * u, w - 4.8 * u, 4.8 * u, 'right')}

  <rect x="${round(5.2 * u)}" y="${round(tickY)}" width="${round(4.5 * u)}" height="${round(tickH)}" fill="${accent}"/>
  ${place(text.name, 5.2 * u, nameBaseline, nameSize)}
  ${place(text.season, 5.2 * u, foot, smallSize, 0.85)}
  ${place(text.org, w - 5.2 * u - orgW, foot, smallSize, 0.85)}
</svg>
`
}
