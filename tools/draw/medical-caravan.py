#!/usr/bin/env python3
"""
Draws logos/src/marks/medical-caravan.svg — the medical caravan's own mark.

    python3 tools/draw/medical-caravan.py

An EVENT does not wear the mosque. Until now the caravan carried the health
committee's stethoscope-and-heart, which made the committee and the event the
same drawing; this replaces it. What keeps the mark in the family is the
palette, not the geometry — every colour here resolves through
brand/tokens/color.json → marks.medical-caravan.

Unlike the U18 cup there is nothing to trace. The two files in resources/ are
the caravan's terms of reference, not a poster, so the mark is constructed:
a crescent, one line crossing its opening that beats and then becomes a
stethoscope, and a khaima pitched under it.

WHY A CRESCENT AND NOT A CROSS. The crescent is the medical sign that reads
correctly here, and it is already in the family — it is the finial on every
minaret of the association's own mark.

THE OPENING IS THE WHOLE PROBLEM. A crescent is the difference of two circles,
and how open it looks is fixed by them:

    thickness at the back   t = R - r + d
    angular opening         2·arccos( (d² - r² + R²) / (2·d·R) )

Those two pull against each other. The first attempt used R=178, r=144, d=50,
which is a bold 84-unit crescent — and an opening of 82°, so the horns curl in
and it reads as a ring with a bite taken out of it rather than as a moon.
Opening it to 124° was not enough either — but the reason was not the angle. It
was that a crescent drawn as an evenodd pair of full circles stops being a
crescent the moment the cut circle pokes out the far side; see `crescent`.

With that fixed, the shape is tuned to the Red Crescent emblem rather than to a
decorative moon: SLIM and LONG-HORNED. The back is 66 units against a 360-unit
diameter, and the horns run to ±57° of the horizontal, so the mass wraps 245°
and the tips reach past the mark's waist. Do not adjust one of R, r, d alone;
they trade against each other through the two lines above.

EVERYTHING IN THE CAVITY MUST STAY CLEAR OF THE MASS. The trace is a second
element in the same ink as the crescent in both one-ink variants, so anywhere
it touches, the two fuse and the mark loses its opening. `audit` below measures
the worst approach and refuses to write a file that closes it up.
"""
import math, os

# ── the crescent ─────────────────────────────────────────────────────────────
OUT = (256.0, 256.0, 180.0)        # outer circle: cx, cy, R
CUT = (302.0, 256.0, 160.0)        # the circle subtracted from it: cx, cy, r

# ── the line that crosses it ─────────────────────────────────────────────────
# Three direction changes and no more. An earlier beat oscillated five times
# and at the badge minimum the whole trace closed into a single smear.
# Amplitude is deliberately large against a thin stroke. A trace drawn at the
# crescent's own weight competes with it; drawn thin and tall it reads as an
# instrument's line, which is what it is.
BEAT = [(196, 206), (230, 206), (248, 238), (266, 124), (286, 254), (300, 206), (340, 206)]

# The tail does not stop; it curves down and becomes the stethoscope's tube.
# Drawn as one stroke with the beat, because a stethoscope set beside the trace
# is a third object to place, and the same shape run on from it is not.
# It bows out to the right and hangs down, the way a stethoscope round a neck
# does. An earlier tube curled back to the LEFT under the beat, and the two
# together read as a musical note rather than as an instrument.
# The tube hangs further right than it needs to on its own account. That is the
# camp's doing: the chestpiece and the tent are the only two things in the
# bottom of the opening, and the tent is the one that needs the room.
TUBE = [((374, 212), (384, 244), (378, 278)),
        ((372, 308), (370, 332), (370, 340))]

CHEST = (366.0, 348.0, 22.0)       # the chestpiece, over the end of the tube

# ── the camp ─────────────────────────────────────────────────────────────────
# A khaima under the trace, in the corner of the opening the stethoscope leaves
# empty. It is what the caravan actually looks like on the ground for the two
# days it exists, and it is the only part of the mark that says Taguilalett
# rather than medicine.
#
# Drawn in its own coordinates and then placed, because the tent's proportions
# are a shape worth keeping and its size here is not. How big it can be is set
# by the cut circle, which closes in fast towards the bottom of the opening:
# at the tent's own baseline the cavity is 220 units across, and the chestpiece
# has to fit beside it. Both of those clearances sit within a couple of units of
# the floor, which is the honest answer to "can the tent be bigger" — not
# without moving the crescent. The sides are CONCAVE:
# guyed fabric falls INSIDE the line from peak to peg, and convex sides read as
# two hills instead of a tent.
CAMP = (268.0, 338.0, 128.0)       # centre x, centre y, width
TENT = [(-208, 88),
        ((-158, 62), (-116, -20), (-100, -100)),
        ((-94, -106), (-86, -104), (-80, -96)),
        ((-52, -80), (-30, -72), (0, -72)),
        ((30, -72), (52, -80), (80, -96)),
        ((86, -104), (94, -106), (100, -100)),
        ((116, -20), (162, 62), (208, 88))]
TENT_W, TENT_H = 416.0, 214.0      # the local drawing's extent, for scaling
DOOR = [(-48, 102), (-48, 14), ((-48, -30), (48, -30), (48, 14)), (48, 102)]

STROKE = 11.0                      # thinner than the mass by design: the
                                   # crescent carries the mark, the line reads
                                   # against it rather than competing.

# Everything above is in DESIGN units, laid out for the drawing's own sake. The
# mark then gets scaled and centred to fill the 512 box, because a crescent
# hanging left with a stethoscope hanging right is not centred on the box even
# when each half is where it should be, and a mark that sits off its own axis
# reads as small and adrift in every lockup it lands in.
TARGET = 452.0                     # what the finished mark spans, of 512

CRE, TRA = 'var(--crescent, #1d5c50)', 'var(--trace, #b0643e)'
CMP = 'var(--camp, #2f8f7d)'


def n(v): return f"{v:.2f}".rstrip("0").rstrip(".")
def pt(p): return f"{n(p[0])},{n(p[1])}"

def circle(cx, cy, r):
    return f"M {n(cx)},{n(cy - r)} a {n(r)},{n(r)} 0 1 1 -0.01,0 Z"


def horns():
    """Where the two circles cross — the horn tips, and the crescent's geometry."""
    ox, oy, R = OUT
    cx, cy, r = CUT
    d = cx - ox
    a = (d * d - r * r + R * R) / (2 * d)
    h = math.sqrt(R * R - a * a)
    return (ox + a, oy - h), (ox + a, oy + h), a, h


def crescent():
    """Two arcs, not two circles.

    A crescent drawn as an evenodd pair of full circles is only correct while
    the cut circle sits ENTIRELY inside the outer one. Push it sideways far
    enough to open the horns and it pokes out the other side, and evenodd then
    fills that sliver too — a second thin lune down the right edge that closes
    the shape back up into a ring. It is subtle at a glance and obvious once
    seen, and it is what made every earlier crescent here read as a C.

    So the mass is stated directly: the long way round the outer circle from one
    horn to the other, then back along the cut circle's left side.

    The inner arc's large-arc flag is DERIVED, not chosen. Whether the return
    journey is the long or the short way round the cut circle flips depending on
    which side of the cut circle's own centre the horns fall on — that is, on
    whether a > d. Hard-coding it produced a crescent that looked right for one
    set of radii and silently fattened into a half-moon for the next.
    """
    (h1, h2, a, h) = horns()
    R, r = S(OUT[2]), S(CUT[2])
    inner_large = 1 if a > (CUT[0] - OUT[0]) else 0
    return (f"M {pt(T(h1))} A {n(R)},{n(R)} 0 1 0 {pt(T(h2))}"
            f" A {n(r)},{n(r)} 0 {inner_large} 1 {pt(T(h1))} Z")


def audit():
    """How close the trace comes to the crescent, and how open the crescent is.

    Both are one-ink failures rather than colour ones, which is why they are
    checked here and not left to the eye: in colour the trace is copper on
    teal and a near-touch still reads; in mono-dark both are the same ink and
    a near-touch is a join.
    """
    ox, oy, R = OUT
    cx, cy, r = CUT

    _, _, a, _ = horns()
    opening = 2 * math.degrees(math.acos(a / R))
    back = R - r + (cx - ox)

    # Measure every sampled point's distance to the cut circle, which is the
    # cavity's boundary and so the mass's edge.
    camp_pts = camp_points()
    worst = min([r - math.hypot(p[0] - cx, p[1] - cy) - STROKE / 2 for p in trace_points()]
                + [r - math.hypot(CHEST[0] - cx, CHEST[1] - cy) - CHEST[2]]
                + [r - math.hypot(p[0] - cx, p[1] - cy) for p in camp_pts]
                # and the three pairs that can collide with each other rather
                # than with the mass: tent against chestpiece, both of them in
                # the bottom of the opening, and tent against the trace, whose
                # trough comes down towards the ridge.
                + [math.hypot(p[0] - CHEST[0], p[1] - CHEST[1]) - CHEST[2] for p in camp_pts]
                + [math.hypot(a[0] - b[0], a[1] - b[1]) - STROKE / 2
                   for a in trace_points() for b in camp_pts])
    return opening, back, worst


def trace_points():
    """The stroke's centre line, sampled. Used both to fit the box and to audit
    the clearance, so the two can never disagree about where the line goes."""
    pts = list(BEAT)
    p0 = BEAT[-1]
    for c1, c2, p3 in TUBE:
        for i in range(1, 41):
            t = i / 40
            pts.append(tuple(
                (1 - t) ** 3 * p0[k] + 3 * (1 - t) ** 2 * t * c1[k]
                + 3 * (1 - t) * t * t * c2[k] + t ** 3 * p3[k] for k in (0, 1)))
        p0 = p3
    return pts


def camp():
    """Local tent coordinates -> design coordinates."""
    cx, cy, w = CAMP
    k = w / TENT_W
    return lambda p: (cx + p[0] * k, cy + p[1] * k)


def camp_points():
    """The tent's outline, sampled in design space.

    The bounding box will not do here. The tent's corners are EMPTY — the hem
    sags away from them and the peaks pull in — so checking the box against the
    crescent rejects a tent that fits, and by a wide enough margin (five units
    on a twelve-unit floor) to cost the drawing real size.
    """
    C = camp()
    pts, p0 = [C(TENT[0])], TENT[0]
    for c1, c2, p3 in TENT[1:]:
        for i in range(1, 17):
            t = i / 16
            pts.append(C(tuple(
                (1 - t) ** 3 * p0[k] + 3 * (1 - t) ** 2 * t * c1[k]
                + 3 * (1 - t) * t * t * c2[k] + t ** 3 * p3[k] for k in (0, 1))))
        p0 = p3
    hem = (0, 108)                                     # the hem's quadratic control
    for i in range(1, 17):                             # ...back along the sagging hem
        t = i / 16
        pts.append(C(tuple((1 - t) ** 2 * p0[k] + 2 * (1 - t) * t * hem[k]
                           + t * t * TENT[0][k] for k in (0, 1))))
    return pts


def camp_box():
    """The tent's design-space bounding box."""
    cx, cy, w = CAMP
    h = TENT_H * w / TENT_W
    # The local drawing runs y -106..108, so its centre is 1 unit below zero.
    mid = cy + 1.0 * w / TENT_W
    return cx - w / 2, cx + w / 2, mid - h / 2, mid + h / 2


def tent_path():
    """The tent, with its doorway as an evenodd hole.

    A hole rather than a shape laid over it, so the doorway opens onto the page
    in every variant instead of needing a colour of its own that would have to
    be dropped in one ink.
    """
    C = camp()
    d = f"M {pt(T(C(TENT[0])))}"
    for c1, c2, p3 in TENT[1:]:
        d += f" C {pt(T(C(c1)))} {pt(T(C(c2)))} {pt(T(C(p3)))}"
    d += f" Q {pt(T(C((0, 108))))} {pt(T(C(TENT[0])))} Z"
    d += (f" M {pt(T(C(DOOR[0])))} L {pt(T(C(DOOR[1])))}"
          f" C {pt(T(C(DOOR[2][0])))} {pt(T(C(DOOR[2][1])))} {pt(T(C(DOOR[2][2])))}"
          f" L {pt(T(C(DOOR[3])))} Z")
    return d


def fit():
    """Scale about the drawing's own bounding box so it fills the 512 box.

    The crescent's box is the outer circle's left, top and bottom edges — the
    long arc passes through all three — closed on the right at the horn tips.
    """
    ox, oy, R = OUT
    hx = horns()[0][0]
    bx0, bx1, by0, by1 = camp_box()
    xs = [ox - R, hx] + [p[0] - STROKE / 2 for p in trace_points()] \
                      + [p[0] + STROKE / 2 for p in trace_points()] \
                      + [CHEST[0] - CHEST[2], CHEST[0] + CHEST[2], bx0, bx1]
    ys = [oy - R, oy + R] + [p[1] - STROKE / 2 for p in trace_points()] \
                          + [p[1] + STROKE / 2 for p in trace_points()] \
                          + [CHEST[1] - CHEST[2], CHEST[1] + CHEST[2], by0, by1]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    k = TARGET / max(x1 - x0, y1 - y0)
    return k, 256 - k * (x0 + x1) / 2, 256 - k * (y0 + y1) / 2


K, DX, DY = fit()
def T(p): return (DX + K * p[0], DY + K * p[1])
def S(v): return K * v


def build():
    d_trace = ("M " + pt(T(BEAT[0])) + " L " + " L ".join(pt(T(p)) for p in BEAT[1:])
               + "".join(f" C {pt(T(c1))} {pt(T(c2))} {pt(T(p3))}" for c1, c2, p3 in TUBE))
    return [
        f'<path fill="{CRE}" d="{crescent()}"/>',
        f'<path fill="none" stroke="{TRA}" stroke-width="{n(S(STROKE))}" stroke-linecap="round"'
        f' stroke-linejoin="round" d="{d_trace}"/>',
        f'<path fill="{TRA}" d="{circle(*T(CHEST[:2]), S(CHEST[2]))}"/>',
        f'<path fill="{CMP}" fill-rule="evenodd" d="{tent_path()}"/>',
    ]


HEADER = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <title>Caravane médicale — القافلة الطبية</title>

  <!--
    GENERATED by tools/draw/medical-caravan.py. Do not hand-edit the path data.

    The medical caravan's own mark: a crescent, one line crossing its opening
    that beats and then runs on into a stethoscope, and a small khaima pitched
    in the corner the stethoscope leaves empty. An event is allowed
    a mark of its own; what keeps it in the family is the palette. Every colour
    here is a token bound at build time, and the hex in each fallback is only so
    the file previews correctly in an editor.

    Everything inside the opening is the SAME ink as the crescent in both
    one-ink variants, and is kept clear of it by construction — the generator
    refuses to write a file where anything approaches within 12 units. Move
    them inward at your peril: where they touch, the mark loses its opening and
    goes back to reading as a ring.
  -->
'''

opening, back, clear = audit()
# The floors, not the target. 95° is where the horns start to close over the
# opening; 55 units is where the back stops surviving an 18 mm badge in one ink.
if opening < 95:
    raise SystemExit(f"crescent opens only {opening:.0f}° — the horns close it into a ring")
if back < 55:
    raise SystemExit(f"crescent is {back:.0f} units at the back — too thin to hold at 18 mm")
if clear < 12:
    raise SystemExit(f"the trace comes within {clear:.1f} units of the mass — they fuse in one ink")

out = os.path.join(os.path.dirname(__file__), "..", "..", "logos", "src", "marks", "medical-caravan.svg")
open(out, "w").write(HEADER + "\n".join("  " + b for b in build()) + "\n</svg>\n")
print(f"wrote {os.path.relpath(out)}  "
      f"(opening {opening:.0f}°, back {back:.0f} units, clearance {clear:.1f})")
