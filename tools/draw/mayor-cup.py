#!/usr/bin/env python3
"""
Draws logos/src/marks/mayor-cup.svg — the Mayor's Cup mark.

    python3 tools/draw/mayor-cup.py

THE SAME TROPHY AS THE U18 CUP, IN GOLD. Until September 2026 this cup had a
drawing of its own: a crown over an open chalice, traced scanline by scanline
off resources/cup-logo.jpeg, with a crown of ours replacing the sketch's. It
was a faithful trace and that was the problem — the sketch is the Copa del Rey.
The crown, the splayed stem and the proportion between them are that trophy's,
and a village cup wearing another competition's silhouette is borrowing rather
than belonging. The committee settled instead on the trophy already drawn for
the juniors' cup, told apart by colour. The old trace is in the history of this
file if the drawing is ever wanted again.

Two cups, one drawing, two palettes: mint for the juniors, gold for the mayor's
edition. The geometry is in tools/draw/trophy.py. THIS file is only the Mayor's
Cup's half of it — its title and its preview hexes, which must stay equal to
`marks.mayor-cup.color` in brand/tokens/color.json or the file previews a
colour the build never emits.

The gold is saffron, the one accent in the system that is actually gold, and
the only place saffron is spent — it is what the retired crown was drawn in,
and the Mayor's Cup still owns it. It is spent on the two things that are the
trophy itself, the blades and the ball's panels; everything under them is the
association's mint. The mayor's cup stands on the association's base, which is
the relation the mark is there to state.
"""
import trophy

NOTE = """    The blades and the ball's panels are the mayor's gold; the plinth, the
    foot and the ball under its panels are the association's mint, which is
    what the cup stands on. The wedges over the plinth go to the darkest step
    rather than a second warm one: they meet the blades' tips, and anything
    nearer the gold than that fuses with it at badge size.
"""

trophy.write(
    "mayor-cup", "Coupe du maire — كأس عمدة التاكلالت", NOTE, "mayor-cup.py",
    cup="#c08a1e", plinth="#357a62", foot="#10271f",
    ball="#10271f", ball_patch="#f6ead0", flare="#10271f",
)
