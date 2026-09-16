#!/usr/bin/env python3
"""
Draws logos/src/marks/u18-cup.svg — the U18 cup's mark.

    python3 tools/draw/u18-cup.py

An EVENT does not wear the mosque. A committee is the association acting in a
particular field, so its mark is the association's with a glyph added; a
tournament is a thing the association puts on, it runs for one season, and it
is allowed a mark of its own. What keeps it in the family is the palette, not
the geometry — every colour here resolves through brand/tokens/color.json.

The geometry, and the trace it came from, are in tools/draw/trophy.py. It is
shared with the Mayor's Cup: the same trophy in two palettes. THIS file is only
the U18 cup's half of that — its title and its preview hexes, which must stay
equal to `marks.u18-cup.color` in brand/tokens/color.json or the file previews
a colour the build never emits.
"""
import trophy

NOTE = """    The poster the committee published is pale on maroon. Here the trophy is
    inverted to read on the light grounds a logo actually lands on, and the
    maroon is dropped for mint — the cup mid, the plinth lighter, the foot
    darkest, the ball dark carrying light patches.
"""

trophy.write(
    "u18-cup", "Coupe U18 — كأس تحت 18 سنة", NOTE, "u18-cup.py",
    cup="#265c49", plinth="#357a62", foot="#1a3f33",
    ball="#10271f", ball_patch="#e8b08a", flare="#c47c5a",
)
