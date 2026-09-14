#!/usr/bin/env python3
"""
Draws logos/src/marks/mayor-cup.svg — the Mayor's Cup mark.

    python3 tools/draw/mayor-cup.py

The committee's own drawing, traced. A crown over a cup that is entirely an
OUTLINE: two ears, each a closed hollow rectangle, and two sides that curve in
across the bowl's floor, run down as a narrow parallel stem, and splay back out
into the foot. The sides never meet — the cup is open all the way down, and
that is the whole character of it.

MEASURED, NOT GUESSED. Every point below is sampled off resources/cup-logo.jpeg
in that image's own pixels, and is listed as a sample rather than as a Bézier
control point.

Sampled ALONG THE STROKE'S NORMAL, not along scanlines. A scanline cuts an
oblique chord through a stroke that is not vertical, and the middle of that
chord is not the middle of the stroke; where the bowl's floor flattens out the
chord ran 41 px across a 17 px stroke, and had already swallowed the stem's own
run beside it. Taking those chord centres bent the wall through 35° in a single
step and put a corner in the drawing that the sketch does not have. So the
trace walks the stroke instead: step forward, re-centre on the run measured
perpendicular to the direction of travel, repeat. The walk is resampled at an
even arc length, which is what keeps the samples evenly spaced — the median
run width comes back at 17.0 px, against the 16-18 px measured off the bars.

It took five passes of drawing this by eye to learn why that matters. What the
scan showed and squinting never did: rows 130-250 carry FOUR runs of ink across
the cup, not two. The outer bar, a void, the bowl's wall, and then the mirror.
The ear is a hollow rectangle whose inner side IS the wall, capped square across
the top and curving back into that same wall two thirds of the way down.

EVERY CAP AND JOIN IS ROUND, and each element is one unbroken stroke. Drawn in
pieces with butt caps and mitred corners — which is where this started — every
seam shows: a notch where the cap meets the wall, a step where the ear rejoins
it, a corner where the bowl turns into the stem.

The knee at the top of the stem IS in the sketch, and stays. What is not in the
sketch is a crease halfway down the bowl's floor, and that is the one the
scanline trace invented.
"""
import math, os

CX_SRC = 385.5                     # the sketch's axis of symmetry
SRC_DY = 55.0                      # drops the trace clear of the crown; fit()
                                   # normalises the pair afterwards either way
STROKE = 17.5                      # measured: the bars run 16-18 px

def src(p): return (256.0 + p[0] - CX_SRC, p[1] + SRC_DY)

# The wall: down from the rim, in across the bowl's floor, down the stem, and
# out to the foot's tip.
SIDE = [(301.5,128.0), (301.4,140.2), (301.3,152.3), (301.3,164.5), (301.3,176.7),
        (301.3,188.9), (301.3,201.0), (301.3,213.2), (301.4,225.4), (301.6,237.4),
        (302.4,249.3), (304.5,260.8), (308.5,271.5), (314.4,281.4), (322.0,290.3),
        (331.0,298.0), (341.0,304.5), (351.2,310.4), (360.3,316.7), (366.9,324.6),
        (370.4,334.3), (371.5,345.5), (371.4,357.4), (370.7,369.4), (369.2,381.4),
        (366.6,393.1), (362.6,404.3), (357.0,414.8), (349.9,424.2), (341.4,432.6),
        (332.2,440.3)]

# The ear: across the cap from the wall, down the outer bar, and curving back in
# to rejoin the wall it came from. It ends INSIDE the wall, so the two merge
# rather than butting against each other.
EAR = [(301.5,122.0), (280.0,122.0), (263.0,122.5), (259.0,128.0), (259.1,139.0),
       (259.2,150.1), (259.2,161.1), (259.2,172.2), (259.3,183.2), (259.6,194.3),
       (260.5,205.2), (262.3,216.0), (265.2,226.6), (269.4,236.6), (275.0,245.8),
       (282.1,253.4), (290.6,258.6), (300.1,261.7)]

# ── the crown ────────────────────────────────────────────────────────────────
# The one part that is not traced — it is ours, replacing the sketch's. Sized to
# the sketch's proportion though: 78% of the cup's width, and sitting down on
# the rim rather than floating above it. Five points, tallest at the centre,
# each finished with a ball; the balls OVERLAP their points rather than
# balancing on them, because at the badge minimum a ball that merely touches its
# point separates from it.
PEAK_X = [168.2, 212.1, 256.0, 299.9, 343.8]
PEAK_Y = [70.9, 45.6, 22.0, 45.6, 70.9]
VALLEY = [(189.7, 113.4), (234.1, 105.5), (277.9, 105.5), (322.3, 113.4)]
BALL_R, BALL_DY = 18.0, 8.0
BAND = (152.3, 113.4, 359.7, 156.0, 6.7)          # x0 y0 x1 y1 r
SLOT = (164.3, 128.1, 347.7, 141.4, 6.0)          # the line through the band

TARGET = 478.0                     # what the finished mark spans, of 512


def n(v): return f"{v:.2f}".rstrip("0").rstrip(".")
def pt(p): return f"{n(p[0])},{n(p[1])}"
def mirror(p): return (512.0 - p[0], p[1])


def circle(cx, cy, r):
    return f"M {n(cx)},{n(cy - r)} a {n(r)},{n(r)} 0 1 1 -0.01,0 Z"


def rrect(x0, y0, x1, y1, r, hole=False):
    """A rounded rectangle. Reversed when it is a hole, so evenodd cancels it."""
    if hole:
        return (f"M {n(x0 + r)},{n(y0)} A {n(r)},{n(r)} 0 0 0 {n(x0)},{n(y0 + r)} V {n(y1 - r)} "
                f"A {n(r)},{n(r)} 0 0 0 {n(x0 + r)},{n(y1)} H {n(x1 - r)} "
                f"A {n(r)},{n(r)} 0 0 0 {n(x1)},{n(y1 - r)} V {n(y0 + r)} "
                f"A {n(r)},{n(r)} 0 0 0 {n(x1 - r)},{n(y0)} Z")
    return (f"M {n(x0 + r)},{n(y0)} H {n(x1 - r)} A {n(r)},{n(r)} 0 0 1 {n(x1)},{n(y0 + r)} "
            f"V {n(y1 - r)} A {n(r)},{n(r)} 0 0 1 {n(x1 - r)},{n(y1)} H {n(x0 + r)} "
            f"A {n(r)},{n(r)} 0 0 1 {n(x0)},{n(y1 - r)} V {n(y0 + r)} "
            f"A {n(r)},{n(r)} 0 0 1 {n(x0 + r)},{n(y0)} Z")


def catmull(pts):
    """CENTRIPETAL Catmull-Rom through the measured samples, as cubics.

    The same form, and for the same reason, as curve() in tools/draw/u18-cup.py:
    uniform Catmull-Rom (tangent = (p2-p0)/6) assumes evenly spaced samples, and
    on uneven ones it swings the control point past the next sample and back,
    which shows as a notch in the edge. The walk resamples at an even arc length
    so the spacing is close to even already, but the ear's square cap is a
    deliberate corner between a 21-unit chord and a 7-unit one, and only the
    centripetal form turns that into a corner instead of a loop.

    Assumes the pen is already at pts[0]: emits C segments only, never a moveto.
    Both ends get a straight-line tangent, which is what holds the wall vertical
    where it leaves the rim.
    """
    A = 0.5
    def d(a, b): return math.dist(a, b) ** A
    out = ""
    for i in range(len(pts) - 1):
        p1, p2 = pts[i], pts[i+1]
        if i == 0:
            c1 = (p1[0] + (p2[0]-p1[0])/3, p1[1] + (p2[1]-p1[1])/3)
        else:
            p0 = pts[i-1]
            d1, d2 = d(pts[i-1], p1), d(p1, p2)
            k = 3 * d1 * (d1 + d2)
            c1 = tuple((d1*d1*p2[j] - d2*d2*p0[j] + (2*d1*d1 + 3*d1*d2 + d2*d2)*p1[j]) / k
                       for j in (0, 1))
        if i == len(pts) - 2:
            c2 = (p2[0] - (p2[0]-p1[0])/3, p2[1] - (p2[1]-p1[1])/3)
        else:
            p3 = pts[i+2]
            d2, d3 = d(p1, p2), d(p2, p3)
            k = 3 * d3 * (d3 + d2)
            c2 = tuple((d3*d3*p1[j] - d2*d2*p3[j] + (2*d3*d3 + 3*d3*d2 + d2*d2)*p2[j]) / k
                       for j in (0, 1))
        out += f" C {pt(c1)} {pt(c2)} {pt(p2)}"
    return out


SIDE_D = [src(p) for p in SIDE]
EAR_D = [src(p) for p in EAR]


def crown_box():
    x0 = min(BAND[0], min(PEAK_X) - BALL_R)
    x1 = max(BAND[2], max(PEAK_X) + BALL_R)
    return x0, x1, min(PEAK_Y) - BALL_DY - BALL_R, BAND[3]


def audit():
    """The gap under the crown, and whether the crown overhangs the rim.

    Two ways of failing the same thing: the crown has to sit ON the cup and be
    seen to. Closed up, one ink turns the pair into a lid; drawn wider than the
    rim it stops looking worn and starts looking dropped on.
    """
    cx0, cx1, _, cy1 = crown_box()
    top = min(p[1] for p in SIDE_D + EAR_D) - STROKE / 2
    rim = 2 * (256.0 - min(p[0] for p in EAR_D)) + STROKE
    return top - cy1, rim, (cx1 - cx0) / rim


def fit():
    """Scale and centre on the drawing's own extent, so the mark fills the box."""
    pts = SIDE_D + EAR_D
    pts += [mirror(p) for p in pts]
    cx0, cx1, cy0, cy1 = crown_box()
    xs = [p[0] - STROKE / 2 for p in pts] + [p[0] + STROKE / 2 for p in pts] + [cx0, cx1]
    ys = [p[1] - STROKE / 2 for p in pts] + [p[1] + STROKE / 2 for p in pts] + [cy0, cy1]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    k = TARGET / max(x1 - x0, y1 - y0)
    return k, 256 - k * (x0 + x1) / 2, 256 - k * (y0 + y1) / 2


K, DX, DY = fit()
def T(p): return (DX + K * p[0], DY + K * p[1])
def S(v): return K * v


CUP, CRW = 'var(--cup, #10271f)', 'var(--crown, #c08a1e)'


def build():
    sw = (f'stroke-width="{n(S(STROKE))}" stroke-linecap="round" '
          f'stroke-linejoin="round"')
    body = []
    for flip in (False, True):
        m = mirror if flip else (lambda q: q)
        for line in (SIDE_D, EAR_D):
            w = [T(m(q)) for q in line]
            body.append(f'<path fill="none" stroke="{CUP}" {sw} d="M {pt(w[0])}{catmull(w)}"/>')

    # The crown: the zigzag, then the balls, then the band with its slot as a
    # hole so the line through it opens onto the page in every variant. The
    # zigzag starts inset and dropped into the band — run to the band's own
    # corners and its square ends overhang the rounded ones, which shows as a
    # nick out of the top edge.
    base = BAND[1] + 6.0
    zig = f"M {pt(T((BAND[0] + BAND[4], base)))}"
    for i, (px, py) in enumerate(zip(PEAK_X, PEAK_Y)):
        zig += f" L {pt(T((px, py)))}"
        if i < len(VALLEY):
            zig += f" L {pt(T(VALLEY[i]))}"
    zig += f" L {pt(T((BAND[2] - BAND[4], base)))} Z"
    body.append(f'<path fill="{CRW}" d="{zig}"/>')
    for px, py in zip(PEAK_X, PEAK_Y):
        body.append(f'<path fill="{CRW}" d="{circle(*T((px, py - BALL_DY)), S(BALL_R))}"/>')
    band = rrect(*T(BAND[:2]), *T(BAND[2:4]), S(BAND[4]))
    slot = rrect(*T(SLOT[:2]), *T(SLOT[2:4]), S(SLOT[4]), hole=True)
    body.append(f'<path fill="{CRW}" fill-rule="evenodd" d="{band} {slot}"/>')
    return body


HEADER = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <title>Coupe du maire — كأس عمدة التاكلالت</title>

  <!--
    GENERATED by tools/draw/mayor-cup.py. Do not hand-edit the path data.

    The committee's own cup, traced from resources/cup-logo.jpeg scanline by
    scanline; the crown is ours. An event is allowed a mark of its own, and what
    keeps it in the family is the palette — every colour here is a token bound at
    build time, and the hex in each fallback is only so the file previews
    correctly in an editor.

    The cup is an OUTLINE and is open all the way down: two sides that never
    meet, and two ears that are closed hollow rectangles sharing the bowl's wall.
    Its interior is therefore a real opening rather than a hole cut in a mass,
    which is what keeps it open when the crown and the cup collapse to one ink.
  -->
'''

gap, rim, crown_ratio = audit()
if gap < 10:
    raise SystemExit(f"only {gap:.1f} units between crown and rim — they fuse into a lid in one ink")
if crown_ratio > 0.95:
    raise SystemExit(f"the crown is {crown_ratio:.0%} of the rim — it overhangs and reads as dropped on")

out = os.path.join(os.path.dirname(__file__), "..", "..", "logos", "src", "marks", "mayor-cup.svg")
open(out, "w").write(HEADER + "\n".join("  " + b for b in build()) + "\n</svg>\n")
print(f"wrote {os.path.relpath(out)}  "
      f"(crown gap {gap:.0f}, rim {rim:.0f}, crown {crown_ratio:.0%} of it, scale {K:.3f})")
