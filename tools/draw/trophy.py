#!/usr/bin/env python3
"""
The trophy, drawn once — the artwork behind BOTH logos/src/marks/u18-cup.svg
and logos/src/marks/mayor-cup.svg.

Nothing here runs on its own. tools/draw/u18-cup.py and tools/draw/mayor-cup.py
each call write() with their own filename, title, note and fallback hexes; the
geometry that comes out is the same drawing in both files. That is deliberate:
the two competitions are the association's, they are run by the same committee
in the same season, and what tells them apart is COLOUR — bound per mark in
brand/tokens/color.json under `marks.u18-cup` and `marks.mayor-cup`. The hexes
passed in here are only so each file previews correctly in an editor.

WHY THE MAYOR'S CUP IS DRAWN FROM THE U18 POSTER AND NOT ITS OWN SKETCH. It had
its own mark until September 2026: a crown over an open chalice, traced from
resources/cup-logo.jpeg. Drawn faithfully it is the Copa del Rey — the crown,
the splayed stem and the proportion between them are that trophy's, and a
village cup that wears another competition's silhouette is borrowing rather
than belonging. The committee settled on this shape for both cups instead. The
old trace is in the history at tools/draw/mayor-cup.py, before this commit, if
the drawing is ever wanted again.

The drawing is traced from resources/u18-logo.jpeg, the poster the committee
already published. Four ribbon blades sweep up out of a stem to form the cup,
a football sits in a ring at its mouth, two flares and a plinth carry it. The
blade edges below are MEASURED off that poster, row by row, in its own pixel
coordinates — which is why they are listed as samples rather than as Bézier
control points. Re-measuring beats re-guessing. TX/TY map those pixels into
the 512-unit symbol box at the end.

The ball is built the way the football glyph is, with one difference that
matters: it is a dark disc with light patches, not the reverse. So the patch
colour is painted as a disc UNDERNEATH and the dark disc on top carries the
pentagons as evenodd holes. In one ink the under-disc resolves to `none`, the
holes open onto the page, and the ball stays a ball instead of going to a
solid blob.
"""
import math, os

# ── measured off the poster, in its pixel space ──────────────────────────────
CX_SRC = 404.0                     # the poster's axis of symmetry, read off mirrored rows

# left outer blade: a slanted top cut, then two long edges down to a point
OUTER_TOP  = (268, 122)          # the slanted cut at the top of the outer blade

# The four blade edges, MEASURED off the poster one row at a time, DESPIKED,
# smoothed, resampled every 12px, and finally FITTED. Every word of that is
# load-bearing:
#
#   measured densely   -- sampling has to follow curvature. An early pass used
#                         15px throughout and the inner blade's crown, which
#                         turns through 60 degrees in 20 rows, arrived as a hard
#                         CORNER that no interpolation can round without
#                         swinging wide of it.
#   despiked           -- at y=241 the ring split the inner blade into two runs
#                         and the scan took the wrong fragment, putting BOTH its
#                         edges about 20px out on that single row. On the outer
#                         edge the smoother then spread that one row across its
#                         whole window and it showed as a bulge beside the ball;
#                         on the inner edge it put the edge to the LEFT of the
#                         outer one, which self-intersects the contour and makes
#                         the fill cancel. Rows more than 4px off the median of
#                         their neighbours are now dropped before anything else
#                         runs. The tell was a polynomial fit whose error stuck
#                         at 19.9px no matter the degree: that is an outlier,
#                         not a curve.
#   smoothed           -- the JPEG edge jitters +/-1px, which is visible ripple
#                         at this scale.
#
# ALL FOUR EDGES ARE NOW FITTED QUARTICS, evaluated back onto the 12px rows.
#
# INNER_RIGHT was the first, and for a reason of its own: it has no measurable
# data between y=171 and y=299 -- the ring crosses the blade there and what the
# poster shows in that band is the RING's edge, not the blade's. One curve
# fitted to the data on both sides spans it with no join; an explicit bridge
# between two sample runs leaves a slope discontinuity at each end, and those
# were the two lumps beside the ball.
#
# The other three were left as smoothed samples, and smoothing is not enough.
# The despiker takes out the gross outliers and the smoother takes out most of
# the jitter, but what survives is a +/-1.5px ripple, and a ripple that small
# still reverses the sign of the curvature from one sample to the next: nine
# reversals down OUTER_LEFT alone. Centripetal Catmull-Rom then does its job
# faithfully and draws every one of them. A quartic fits OUTER_LEFT to 0.4px
# and OUTER_RIGHT to 1.0px over their whole length -- well inside the trace's
# own accuracy -- so the ripple was never in the poster, only in the scan.
# Refitting moves no point by more than 0.6px and takes the reversals to zero.
#
# What is NOT fitted, because it is drawing rather than noise: INNER_LEFT's
# first five samples, which are the slanted crown, and the two samples at each
# blade's tip. Those are corners, and a fit through them rounds them off.
#
# The outer blade is very nearly a pair of circular arcs -- a least-squares
# circle fits each edge to within 3px over its whole length, radii 597 and 535 --
# so what comes out there is an arc whether or not it is written as one. The
# inner blade is not: its crown misses any single circle by 25px.

OUTER_LEFT  = [(243.3,140),(245.2,152),(247.4,164),(249.8,176),(252.4,188),(255.3,200),
               (258.4,212),(261.6,224),(265.1,236),(268.7,248),(272.6,260),(276.6,272),
               (280.9,284),(285.5,296),(290.3,308),(295.4,320),(300.8,332),(306.6,344),
               (312.9,356),(319.6,368),(326.8,380),(334.6,392),(343.1,404),(352.2,416),
               (362.1,428),(366.4,432),(368.2,434)]
OUTER_RIGHT = [(368.2,434),(369,433),(360.1,423),(351.8,411),(344.1,399),(337,387),
               (330.3,375),(324,363),(318.2,351),(312.8,339),(307.9,327),(303.3,315),
               (299,303),(295.1,291),(291.5,279),(288.2,267),(285.2,255),(282.5,243),
               (280,231),(277.7,219),(275.7,207),(273.9,195),(272.3,183),(270.8,171),
               (269.6,159),(268.5,147),(267.5,135),(266.8,123)]

INNER_LEFT  = [(350,77.5),(345.4,80),(323.3,92),(301.4,104),(289.7,116),(290.2,128),
               (289.8,140),(289.8,152),(290.2,164),(290.9,176),(291.9,188),(293.2,200),
               (294.9,212),(296.8,224),(299.1,236),(301.8,248),(304.7,260),(308,272),
               (311.7,284),(315.8,296),(320.3,308),(325.1,320),(330.5,332),(336.3,344),
               (342.7,356),(349.6,368),(357,380),(365.1,392),(373.8,404),(383.3,416),
               (391,425),(391,426)]
INNER_RIGHT = [(391,426),(392.3,425),(386.7,415),(380.3,403),(374.3,391),(368.7,379),
               (363.4,367),(358.5,355),(353.9,343),(349.7,331),(345.8,319),
               (342.2,307),(338.9,295),(336,283),(333.5,271),(331.3,259),(329.4,247),
               (327.9,235),(326.8,223),(326,211),(325.7,199),(325.8,187),(326.3,175),
               (327.3,163),(328.8,151),(330.7,139),(333.2,127),(336.3,115),(340,103),
               (344.2,91),(349.2,79),(350,77.5)]

# The ball, as measured on the poster, scaled about its own centre by BALL_K.
#
# BALL_K IS NOT A FREE PARAMETER. The ring around the ball is what closes the
# cup's mouth: on the poster the blades' inner edges run into it, and the four
# blades plus the ring read as one silhouette. Shrink the ball and the ring
# comes with it, the blades stop meeting anything, and the ball floats in a hole
# in the middle of the cup. Tried at 0.94, 0.88 and 0.82; by 0.88 it has clearly
# detached. Making the ball genuinely smaller means narrowing the whole mouth,
# which is a redraw of the blades, not a scale factor.
BALL_K = 1.0
BALL_Y = 227.0                     # as measured
RING_O, RING_I = 94.0*BALL_K, 85.0*BALL_K
BALL   = (CX_SRC, BALL_Y, RING_I)
RC, RO, DO = 33.0*BALL_K, 27.0*BALL_K, 57.0*BALL_K   # centre patch, rim patch, rim distance
PATCH_A0 = 90.0                   # rim patches start at the foot, one per edge of the centre patch

FLARE  = [(CX_SRC-75, 473), (CX_SRC-19, 473), (CX_SRC-47, 434)]   # left flare triangle
PLINTH = (CX_SRC-83,  478, CX_SRC+83,  538, 10)                   # x0 y0 x1 y1 r
FOOT   = (CX_SRC-104, 538, CX_SRC+104, 576, 10)

TOP, BOTTOM = 74.0, 576.0          # what the mark spans in poster pixels

# ── the two things that make a blade disappear ───────────────────────────────
def audit(name, left, right):
    """A blade is a closed contour: down the outer edge, back up the inner one.
    If the inner edge ever crosses the outer one the contour is a figure-eight,
    the two lobes wind in opposite directions, and the fill CANCELS - the blade
    vanishes rather than looking wrong, which is why it took three passes to
    find. Both failures below have actually happened here:

      * one rogue sample. A row where the ring split the blade in two left the
        right edge at x=294 with its neighbours at 323 and 333, i.e. to the LEFT
        of the left edge. The blade disappeared from y=201 to y=294.
      * too big a stride. The right edge has no measurable data between y=171
        and y=299 - the ring crosses the blade there and what the poster shows
        is the ring's edge, not the blade's - and a single spline segment across
        a 130-row gap swings far enough to cross the other edge. It is bridged
        with a Hermite that matches the slope at both ends.
    """
    for a, b in ((left, "left"), (right, "right")):
        for p, q in zip(a, a[1:]):
            if abs(q[1] - p[1]) > 20:
                raise SystemExit(f"{name} {b} edge: {abs(q[1]-p[1]):.0f}-row gap at y={p[1]:.0f}. "
                                 "Sample it; a spline across a gap that size swings into the other edge.")
    lo = max(min(p[1] for p in left), min(p[1] for p in right))
    hi = min(max(p[1] for p in left), max(p[1] for p in right))
    def at(pts, y):                       # interpolate, do not snap: near the
        q = sorted(pts, key=lambda p: p[1])   # tips the samples are close enough
        for a, b in zip(q, q[1:]):            # together that snapping reports a
            if a[1] <= y <= b[1]:             # crossing where there is none
                t = 0 if b[1] == a[1] else (y - a[1]) / (b[1] - a[1])
                return a[0] + t * (b[0] - a[0])
        return q[0][0] if y < q[0][1] else q[-1][0]
    # skip the last few rows at each end: there the two edges legitimately meet
    for y in range(int(lo) + 12, int(hi) - 11, 2):
        if at(right, y) <= at(left, y):
            raise SystemExit(f"{name}: inner edge is left of the outer edge at y={y}. "
                             "The contour self-intersects and the fill cancels.")

audit("OUTER", OUTER_LEFT, OUTER_RIGHT)
audit("INNER", INNER_LEFT, INNER_RIGHT)

# ── poster pixels -> the 512 symbol box ──────────────────────────────────────
SYM, MARGIN = 512.0, 16.0
S  = (SYM - 2*MARGIN) / (BOTTOM - TOP)
def TX(x): return (x - CX_SRC) * S + SYM/2
def TY(y): return (y - TOP) * S + MARGIN
def T(p):  return (TX(p[0]), TY(p[1]))
def M(p):  return (TX(2*CX_SRC - p[0]), TY(p[1]))     # mirrored

def n(v): return f"{v:.2f}".rstrip('0').rstrip('.')
def pt(p): return f"{n(p[0])},{n(p[1])}"

def curve(pts):
    """CENTRIPETAL Catmull-Rom through the measured samples, as cubics.

    Uniform Catmull-Rom (tangent = (p2-p0)/6) is wrong for this data. The
    samples are not evenly spaced — the crown of the inner blade covers 36
    units between two rows and its flank covers 15 — and on uneven spacing the
    uniform form overshoots: at the point where the steep crown meets the
    near-vertical flank it swings the control point PAST the flank and back,
    which draws a notch in the edge. Centripetal (alpha = 0.5) parameterises by
    the square root of chord length and is provably free of cusps and
    self-intersections, so the same samples come out as one clean sweep.

    Assumes the pen is already at pts[0]: this emits C segments only, never a
    moveto. The two ends get a straight-line tangent so tips stay SHARP —
    a smooth tangent there rounds off the points the drawing is made of.
    """
    A = 0.5
    def d(a, b):
        return math.dist(a, b) ** A
    out = []
    for i in range(len(pts) - 1):
        p1, p2 = pts[i], pts[i+1]
        if i == 0:
            c1 = (p1[0] + (p2[0]-p1[0])/3, p1[1] + (p2[1]-p1[1])/3)
        else:
            p0 = pts[i-1]
            d1, d2 = d(p0, p1), d(p1, p2)
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
        out.append(f"C {pt(c1)} {pt(c2)} {pt(p2)}")
    return " ".join(out)

def blade(left, right, xf, top=None):
    """One ribbon: an optional straight top cut, then down the outer edge and
    back up the inner one. The tip and the top cut stay CORNERS — smoothing
    through them would round off the points the drawing is made of."""
    l = [xf(p) for p in left]
    r = [xf(p) for p in right]
    head = f"M {pt(xf(top))} L {pt(l[0])} " if top else f"M {pt(l[0])} "
    return head + curve(l) + " " + curve(r) + " Z"

def poly(cx, cy, R, rot, k=5):
    v = [(cx + R*math.cos(math.radians(rot + 360*i/k)),
          cy + R*math.sin(math.radians(rot + 360*i/k))) for i in range(k)]
    return "M " + " L ".join(pt(p) for p in v) + " Z"

def rrect(x0, y0, x1, y1, r):
    a, b = T((x0, y0)), T((x1, y1))
    rr = r * S
    return (f"M {n(a[0]+rr)},{n(a[1])} H {n(b[0]-rr)} A {n(rr)},{n(rr)} 0 0 1 {n(b[0])},{n(a[1]+rr)} "
            f"V {n(b[1]-rr)} A {n(rr)},{n(rr)} 0 0 1 {n(b[0]-rr)},{n(b[1])} H {n(a[0]+rr)} "
            f"A {n(rr)},{n(rr)} 0 0 1 {n(a[0])},{n(b[1]-rr)} V {n(a[1]+rr)} "
            f"A {n(rr)},{n(rr)} 0 0 1 {n(a[0]+rr)},{n(a[1])} Z")

def circle(cx, cy, r, hole=False):
    c = T((cx, cy)); rr = r * S
    s, e = ("0 1 0", "0.01,0") if hole else ("0 1 1", "-0.01,0")
    return f"M {n(c[0])},{n(c[1]-rr)} a {n(rr)},{n(rr)} {s} {e} Z"

# ── emitting a mark ──────────────────────────────────────────────────────────
# Both marks are this drawing with a different set of fallbacks. The var()
# NAMES are the same six in both files on purpose: a slot means the same part
# of the trophy whichever cup it belongs to, so the two blocks in color.json
# can be read side by side.

def body(cup, plinth, foot, ball, ball_patch, flare):
    """The drawing, as SVG path elements, with each slot's preview hex."""
    CUP = f'var(--cup, {cup})'
    PLI = f'var(--plinth, {plinth})'
    FOO = f'var(--foot, {foot})'
    BAL = f'var(--ball, {ball})'
    PAT = f'var(--ball-patch, {ball_patch})'
    FLA = f'var(--flare, {flare})'

    bc = BALL
    patches = [poly(*T((bc[0], bc[1])), RC*S, -90)]
    for k in range(5):
        a = PATCH_A0 + 72*k
        patches.append(poly(*T((bc[0] + DO*math.cos(math.radians(a)),
                                bc[1] + DO*math.sin(math.radians(a)))), RO*S, a))

    out = []
    for xf in (T, M):
        out.append(f'  <path fill="{CUP}" d="{blade(OUTER_LEFT, OUTER_RIGHT, xf, top=OUTER_TOP)}"/>')
        out.append(f'  <path fill="{CUP}" d="{blade(INNER_LEFT, INNER_RIGHT, xf)}"/>')
    out.append(f'  <path fill="{CUP}" fill-rule="evenodd" d="{circle(bc[0], bc[1], RING_O)} {circle(bc[0], bc[1], RING_I, hole=True)}"/>')
    out.append(f'  <path fill="{PAT}" d="{circle(bc[0], bc[1], RING_I)}"/>')
    out.append(f'  <path fill="{BAL}" fill-rule="evenodd" d="{circle(bc[0], bc[1], RING_I)} ' + " ".join(patches) + '"/>')
    for xf in (T, M):
        out.append(f'  <path fill="{FLA}" d="M ' + " L ".join(pt(xf(p)) for p in FLARE) + ' Z"/>')
    out.append(f'  <path fill="{PLI}" d="{rrect(*PLINTH)}"/>')
    out.append(f'  <path fill="{FOO}" d="{rrect(*FOOT)}"/>')
    return out


def write(mark, title, note, script, **fallbacks):
    """Writes logos/src/marks/<mark>.svg. `note` is the paragraph that explains
    THIS cup; the paragraphs that explain the drawing are the same in both and
    are written here."""
    header = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">\n'
        f'  <title>{title}</title>\n\n'
        '  <!--\n'
        f'    GENERATED by tools/draw/{script}. Do not hand-edit the path data.\n\n'
        f'{note}\n'
        '    The drawing is traced from the poster in resources/u18-logo.jpeg, and\n'
        '    is shared with the other cup — see tools/draw/trophy.py. An event is\n'
        '    allowed a mark of its own; what keeps it in the family is the palette.\n'
        '    Every colour here is a token bound at build time, and the hex in each\n'
        '    fallback is only so the file previews correctly in an editor.\n\n'
        '    Drawing order is load-bearing: ring, then the patch disc, then the ball\n'
        '    over it. The ball\'s pentagons are holes in a dark disc with a light disc\n'
        '    beneath, so that in one ink the light disc drops out, the holes open onto\n'
        '    the page, and the ball stays a ball.\n'
        '  -->\n'
    )
    out = os.path.join(os.path.dirname(__file__), "..", "..", "logos", "src", "marks", f"{mark}.svg")
    open(out, "w").write(header + "\n".join(body(**fallbacks)) + "\n</svg>\n")
    print("wrote", os.path.relpath(out))
