"""Ship kinds beyond the galley for ``civ.ship``: sailing ships and steel ships.

Every builder takes (builder, length, beam) and lays the keel on Z=0 with the bow
towards -Y. Sailing kinds use the slots hull, deck, wood, sail, team, metal; steel
kinds use hull, deck, superstructure, dark, team, metal, glass.
"""

from __future__ import annotations

import math
from collections.abc import Callable

from blender.generators.civ_common import ShapeBuilder
from blender.generators.civ_figure import curved_panel, flag

Vec2 = tuple[float, float]


# --------------------------------------------------------------------------- shared


def ensign(b: ShapeBuilder, top: tuple[float, float, float], width: float, height: float) -> None:
    """A team flag streaming aft (+Y) from a staff top."""
    with b.placed(top, yaw=math.pi / 2):
        flag(b, (0.0, 0.0, 0.0), width, height, "team", wave=width * 0.08)


def mast(b: ShapeBuilder, y: float, z0: float, z1: float, r: float, slot: str = "wood") -> None:
    b.between((0.0, y, z0), (0.0, y, z1), r, slot, segments=8, radius_end=r * 0.6)


# --------------------------------------------------------------------------- sailing ships


class WoodHull:
    """A round-bilged wooden hull, lofted stern to bow, with castles from the sheer."""

    def __init__(self, b: ShapeBuilder, length: float, beam: float, depth: float, stern_rise: float, bow_rise: float) -> None:
        self.L, self.W, self.depth = length, beam * 0.5, depth
        self.stern_rise, self.bow_rise = stern_rise, bow_rise
        rings = []
        n = 11
        for i in range(n):
            t = i / (n - 1)
            y = self.L * 0.5 - t * self.L
            half = self.half_width(y)
            sheer = self.sheer(y)
            rings.append([
                (-half, y, sheer), (-half * 0.95, y, depth * 0.6), (-half * 0.5, y, depth * 0.14), (0.0, y, 0.0),
                (half * 0.5, y, depth * 0.14), (half * 0.95, y, depth * 0.6), (half, y, sheer),
            ])
        b.loft(rings, "hull")

    def _t(self, y: float) -> float:
        return min(1.0, max(0.0, (self.L * 0.5 - y) / self.L))

    def half_width(self, y: float) -> float:
        t = self._t(y)
        return max(self.W * math.sin(math.pi * (0.2 + 0.78 * t)) ** 0.55, 0.05)

    def sheer(self, y: float) -> float:
        t = self._t(y)
        return self.depth + self.stern_rise * max(0.0, 1.0 - t / 0.3) ** 1.5 + self.bow_rise * max(0.0, (t - 0.75) / 0.25) ** 2


def castle(b: ShapeBuilder, hull: WoodHull, y0: float, y1: float, height: float) -> None:
    """A raised castle: a solid block up to `height` above the main deck, decked over, with a rail."""
    yc = (y0 + y1) * 0.5
    w = min(hull.half_width(y0), hull.half_width(y1)) * 1.94
    z = hull.depth + height
    b.box((0.0, yc, hull.depth + height * 0.5 - 0.05), (w, y1 - y0, height + 0.1), "hull")
    b.box((0.0, yc, z), (w + 0.06, y1 - y0 + 0.06, 0.08), "deck")
    for side in (-1.0, 1.0):
        b.box((side * (w * 0.5 - 0.02), yc, z + 0.16), (0.05, y1 - y0, 0.24), "wood")


def square_sail(b: ShapeBuilder, y: float, zc: float, w: float, h: float, team: float = 0.0) -> None:
    """A square sail bellied forward, with its yard; an optional team panel in the middle."""
    bulge = w * 0.09
    with b.placed((0.0, y - 0.12, zc)):
        curved_panel(b, w, h, 0.04, bulge, "sail", segments=4)
        if team > 0.0:
            w2 = w * team
            b2 = bulge * team * team
            with b.placed((0.0, -(bulge - b2), 0.0)):
                curved_panel(b, w2, h * team, 0.08, b2, "team", segments=4)
    b.between((-w * 0.56, y - 0.1, zc + h * 0.5 + 0.04), (w * 0.56, y - 0.1, zc + h * 0.5 + 0.04), 0.045, "wood", segments=6)


def lateen_sail(b: ShapeBuilder, y: float, z0: float, s: float, team: bool = True) -> None:
    """A triangular lateen sail on a slanted yard, aft of its mast."""
    a = (y - 1.3 * s, z0 + 0.9 * s)
    top = (y + 1.25 * s, z0 + 3.4 * s)
    clew = (y + 1.05 * s, z0 + 0.55 * s)
    b.extrude([a, top, clew], "x", 0.04, 0.08, "sail")
    if team:
        cy = (a[0] + top[0] + clew[0]) / 3.0
        cz = (a[1] + top[1] + clew[1]) / 3.0
        inner = [(cy + (p[0] - cy) * 0.55, cz + (p[1] - cz) * 0.55) for p in (a, top, clew)]
        b.extrude(inner, "x", 0.02, 0.1, "team")
    b.between((0.06, a[0] - 0.15 * s, a[1] - 0.12 * s), (0.06, top[0] + 0.1 * s, top[1] + 0.1 * s), 0.04, "wood", segments=6)


def _gun_stripe(b: ShapeBuilder, hull: WoodHull, y0: float, y1: float, z: float, ports: int, band: str) -> None:
    """A painted band along both sides with dark gun ports and muzzles."""
    n = 8
    for side in (-1.0, 1.0):
        for i in range(n):
            ya = y0 + (y1 - y0) * i / n
            yb = y0 + (y1 - y0) * (i + 1) / n
            xa = hull.half_width(ya) * 0.985 * side
            xb = hull.half_width(yb) * 0.985 * side
            yaw = math.atan2(xb - xa, yb - ya)
            b.box(((xa + xb) * 0.5, (ya + yb) * 0.5, z), (0.04, math.hypot(xb - xa, yb - ya) * 1.04, 0.24), band, rotation=(0.0, 0.0, -yaw))
        for i in range(ports):
            y = y0 + (y1 - y0) * (i + 0.5) / ports
            x = hull.half_width(y) * side
            b.box((x, y, z), (0.06, 0.18, 0.15), "hull")
            b.between((x, y, z), (x + 0.16 * side, y, z), 0.035, "metal", segments=6)


def caravel(b: ShapeBuilder, L: float, beam: float) -> None:
    depth = 0.9
    hull = WoodHull(b, L, beam, depth, stern_rise=0.75, bow_rise=0.35)
    b.box((0.0, -0.1 * L, depth - 0.02), (hull.W * 1.6, L * 0.62, 0.06), "deck")
    castle(b, hull, 0.28 * L, 0.47 * L, 0.55)
    for y, h, s in ((-0.22 * L, 3.6, 0.78), (0.03 * L, 4.6, 1.0), (0.27 * L, 3.5, 0.68)):
        mast(b, y, depth - 0.1, depth + h, 0.07)
        lateen_sail(b, y, depth, s)
    ensign(b, (0.0, 0.03 * L, depth + 4.6), 0.7, 0.32)
    b.between((0.0, -0.44 * L, depth + 0.3), (0.0, -0.6 * L, depth + 0.85), 0.05, "wood", segments=6)
    b.between((0.0, 0.49 * L, depth + 0.3), (0.0, 0.53 * L, depth + 1.4), 0.03, "wood", segments=6)


def galleon(b: ShapeBuilder, L: float, beam: float) -> None:
    depth = 1.0
    hull = WoodHull(b, L, beam, depth, stern_rise=1.5, bow_rise=0.7)
    b.box((0.0, -0.05 * L, depth - 0.02), (hull.W * 1.7, L * 0.6, 0.06), "deck")
    # Two-tier sterncastle, forecastle, carved stern.
    castle(b, hull, 0.2 * L, 0.48 * L, 0.75)
    castle(b, hull, 0.33 * L, 0.485 * L, 1.35)
    castle(b, hull, -0.44 * L, -0.28 * L, 0.55)
    b.box((0.0, 0.49 * L, depth + 0.9), (0.6, 0.08, 0.55), "team")  # stern badge
    for i in range(4):
        y = -0.15 * L + i * 0.09 * L
        for side in (-1.0, 1.0):
            b.box((hull.half_width(y) * side, y, depth * 0.78), (0.06, 0.2, 0.18), "wood")
    # Fore and main square-rigged, lateen mizzen.
    for y, s in ((-0.25 * L, 0.88), (-0.02 * L, 1.0)):
        mast(b, y, depth - 0.1, depth + 6.4 * s, 0.09)
        square_sail(b, y, depth + 2.0 * s, 3.0 * s, 1.8 * s, team=0.62)
        square_sail(b, y, depth + 4.1 * s, 2.3 * s, 1.5 * s)
        b.cylinder((0.0, y, depth + 3.15 * s), 0.22, 0.14, "wood", segments=8)  # top
    mast(b, 0.27 * L, depth + 1.3, depth + 5.0, 0.07)
    lateen_sail(b, 0.27 * L, depth + 1.3, 0.8, team=False)
    ensign(b, (0.0, -0.02 * L, depth + 6.4), 0.9, 0.4)
    b.between((0.0, -0.42 * L, depth + 0.6), (0.0, -0.64 * L, depth + 1.5), 0.07, "wood", segments=6)


def frigate(b: ShapeBuilder, L: float, beam: float) -> None:
    depth = 1.05
    hull = WoodHull(b, L, beam, depth, stern_rise=0.55, bow_rise=0.4)
    b.box((0.0, 0.0, depth - 0.02), (hull.W * 1.75, L * 0.72, 0.06), "deck")
    _gun_stripe(b, hull, -0.32 * L, 0.36 * L, depth * 0.8, 9, "sail")
    castle(b, hull, 0.36 * L, 0.48 * L, 0.3)
    for i, (y, s) in enumerate(((-0.25 * L, 0.9), (0.0, 1.0), (0.24 * L, 0.78))):
        mast(b, y, depth - 0.1, depth + 7.0 * s, 0.09)
        square_sail(b, y, depth + 1.9 * s, 3.2 * s, 1.7 * s, team=0.6)
        square_sail(b, y, depth + 3.85 * s, 2.7 * s, 1.6 * s, team=0.55 if i == 1 else 0.0)
        square_sail(b, y, depth + 5.6 * s, 2.0 * s, 1.15 * s)
        b.cylinder((0.0, y, depth + 2.95 * s), 0.24, 0.12, "wood", segments=8)
    # Spanker and jibs.
    b.extrude([(0.25 * L + 0.15, depth + 1.0), (0.25 * L + 0.15, depth + 3.6), (0.47 * L, depth + 1.0)], "x", -0.02, 0.02, "sail")
    b.between((0.0, -0.42 * L, depth + 0.5), (0.0, -0.66 * L, depth + 1.6), 0.07, "wood", segments=6)
    b.extrude([(-0.27 * L, depth + 4.6), (-0.27 * L - 0.1, depth + 0.8), (-0.62 * L, depth + 1.5)], "x", -0.02, 0.02, "sail")
    ensign(b, (0.0, 0.0, depth + 7.0), 1.0, 0.45)


# --------------------------------------------------------------------------- steel ships


class SteelHull:
    """A slab-sided steel hull with a raked bow and a rounded stern; deck plate on top."""

    def __init__(self, b: ShapeBuilder, length: float, beam: float, depth: float, bow_flare: float = 0.25,
                 stern_w: float = 0.78, bow_start: float = 0.55, deck: str = "deck") -> None:
        self.L, self.W, self.depth = length, beam * 0.5, depth
        self.stern_w, self.bow_start, self.bow_flare = stern_w, bow_start, bow_flare
        rings = []
        n = 14
        for i in range(n):
            t = i / (n - 1)
            y = self.L * 0.5 - t * self.L
            w = self.half_width(y)
            u = max(0.0, (t - bow_start) / (1.0 - bow_start))
            sheer = depth + bow_flare * u * u
            keel = depth * 0.55 * u ** 3
            rings.append([(-w, y, sheer), (-w, y, max(keel, depth * 0.3)), (-w * 0.6, y, keel), (w * 0.6, y, keel), (w, y, max(keel, depth * 0.3)), (w, y, sheer)])
        b.loft(rings, "hull")
        outline: list[Vec2] = []
        ts = [i / 20 for i in range(20)] + [0.985]
        right = [(self.half_width(self.L * 0.5 - t * self.L) * 0.97, self.L * 0.5 - t * self.L) for t in ts]
        outline = right + [(-x, y) for x, y in reversed(right)]
        b.extrude(outline, "z", depth - 0.02, depth + 0.03, deck)

    def half_width(self, y: float) -> float:
        t = min(1.0, max(0.0, (self.L * 0.5 - y) / self.L))
        if t < 0.12:
            return self.W * (self.stern_w + (1.0 - self.stern_w) * math.sqrt(t / 0.12))
        if t < self.bow_start:
            return self.W
        u = (t - self.bow_start) / (1.0 - self.bow_start)
        return max(self.W * math.sqrt(max(0.0, 1.0 - u ** 1.7)), 0.03)


def gun_turret(b: ShapeBuilder, y: float, z: float, s: float, barrels: int, aft: bool = False, slot: str = "superstructure") -> None:
    """Rounded-front gun house on a barbette, `barrels` guns pointing forward (or aft)."""
    d = 1.0 if aft else -1.0
    b.cylinder((0.0, y, z + 0.08 * s), 0.42 * s, 0.16 * s, "dark", segments=12)
    front = [(0.42 * s * math.cos(a), d * 0.3 * s * math.sin(a)) for a in (0.0, 0.5, 1.0, 1.57, 2.14, 2.64, 3.14)]
    outline = [(x, y + yy) for x, yy in front] + [(-0.42 * s, y - d * 0.5 * s), (0.42 * s, y - d * 0.5 * s)]
    if not aft:
        outline = list(reversed(outline))
    b.extrude(outline, "z", z + 0.14 * s, z + 0.46 * s, slot)
    for i in range(barrels):
        x = (i - (barrels - 1) * 0.5) * 0.2 * s
        b.between((x, y + d * 0.25 * s, z + 0.3 * s), (x, y + d * 1.45 * s, z + 0.33 * s), 0.05 * s, "metal", segments=6)


def funnel(b: ShapeBuilder, y: float, z: float, r: float, h: float, rake: float = 0.12) -> None:
    b.between((0.0, y, z), (0.0, y + rake * h, z + h), r, "team", segments=10, radius_end=r * 0.92)
    b.between((0.0, y + rake * h * 0.97, z + h * 0.97), (0.0, y + rake * h * 1.03, z + h * 1.06), r * 0.95, "dark", segments=10)


def windows(b: ShapeBuilder, y: float, z: float, w: float) -> None:
    b.box((0.0, y, z), (w, 0.03, 0.12), "glass")


def ironclad(b: ShapeBuilder, L: float, beam: float) -> None:
    depth = 0.55
    SteelHull(b, L, beam, depth, bow_flare=0.05, stern_w=0.7, bow_start=0.62)
    # Sloped casemate (team), iron grating roof, gun ports, pilot house.
    b.extrude([(-0.98, depth), (0.98, depth), (0.56, depth + 0.85), (-0.56, depth + 0.85)], "y", -0.26 * L, 0.24 * L, "team")
    b.box((0.0, -0.01 * L, depth + 0.87), (1.0, 0.48 * L, 0.05), "dark")
    for side in (-1.0, 1.0):
        for i in range(4):
            y = -0.2 * L + i * 0.13 * L
            b.box((0.8 * side, y, depth + 0.42), (0.1, 0.22, 0.2), "dark", rotation=(0.0, -0.46 * side, 0.0))
    b.cylinder((0.0, -0.21 * L, depth + 1.0), 0.28, 0.24, "dark", segments=8, radius_top=0.22)
    funnel(b, 0.02 * L, depth + 0.85, 0.26, 1.2, rake=0.0)
    b.between((0.0, -0.5 * L, 0.3), (0.0, -0.56 * L, 0.25), 0.12, "metal", segments=8, radius_end=0.04)  # ram
    b.between((0.0, 0.44 * L, depth), (0.0, 0.44 * L, depth + 1.6), 0.025, "metal", segments=6)
    ensign(b, (0.0, 0.44 * L, depth + 1.58), 0.6, 0.36)


def transport(b: ShapeBuilder, L: float, beam: float) -> None:
    depth = 0.95
    hull = SteelHull(b, L, beam, depth, bow_flare=0.3, stern_w=0.85, bow_start=0.6)
    W = hull.W
    b.box((0.0, -0.42 * L, depth + 0.2), (hull.half_width(-0.42 * L) * 1.9, 0.12 * L, 0.4), "hull")  # forecastle
    # Cargo hatches with derricks.
    for y in (-0.28 * L, -0.12 * L, 0.06 * L):
        b.box((0.0, y, depth + 0.14), (W * 1.2, 0.1 * L, 0.24), "dark")
    for y in (-0.2 * L, -0.02 * L):
        b.between((0.0, y, depth), (0.0, y, depth + 2.0), 0.06, "metal", segments=6)
        b.between((0.0, y, depth + 0.3), (0.0, y - 0.07 * L, depth + 1.6), 0.03, "metal", segments=6)
        b.between((0.0, y, depth + 0.3), (0.0, y + 0.07 * L, depth + 1.6), 0.03, "metal", segments=6)
    # Aft superstructure, bridge, funnel, lifeboats.
    ys = 0.3 * L
    b.box((0.0, ys, depth + 0.35), (W * 1.8, 0.2 * L, 0.7), "superstructure")
    b.box((0.0, ys - 0.02 * L, depth + 0.95), (W * 1.5, 0.13 * L, 0.5), "superstructure")
    b.box((0.0, ys - 0.03 * L, depth + 1.35), (W * 2.0, 0.07 * L, 0.3), "superstructure")
    windows(b, ys - 0.065 * L - 0.01, depth + 1.37, W * 1.9)
    windows(b, ys - 0.1 * L - 0.01, depth + 0.45, W * 1.7)
    funnel(b, ys + 0.07 * L, depth + 1.2, 0.3, 0.9)
    for side in (-1.0, 1.0):
        b.box((W * 0.82 * side, ys + 0.03 * L, depth + 1.28), (0.18, 0.08 * L, 0.16), "team")
    b.between((0.0, ys - 0.02 * L, depth + 1.5), (0.0, ys - 0.02 * L, depth + 2.4), 0.03, "metal", segments=6)
    b.between((0.0, 0.48 * L, depth), (0.0, 0.48 * L, depth + 1.0), 0.02, "metal", segments=6)
    ensign(b, (0.0, 0.48 * L, depth + 0.98), 0.5, 0.3)


def destroyer(b: ShapeBuilder, L: float, beam: float) -> None:
    depth = 0.7
    hull = SteelHull(b, L, beam, depth, bow_flare=0.3, stern_w=0.7, bow_start=0.55)
    W = hull.W
    gun_turret(b, -0.31 * L, depth, 0.8, 1)
    gun_turret(b, -0.22 * L, depth + 0.3, 0.8, 1)
    b.box((0.0, -0.22 * L, depth + 0.15), (0.6, 0.6, 0.3), "superstructure")
    # Bridge block and tripod mast.
    yb = -0.13 * L
    b.box((0.0, yb, depth + 0.35), (W * 1.5, 0.12 * L, 0.7), "superstructure")
    b.box((0.0, yb - 0.01 * L, depth + 0.9), (W * 1.2, 0.07 * L, 0.4), "superstructure")
    windows(b, yb - 0.045 * L - 0.01, depth + 0.95, W * 1.15)
    b.box((0.0, yb + 0.02 * L, depth + 1.15), (0.5, 0.4, 0.12), "team")
    b.between((0.0, yb + 0.06 * L, depth + 0.7), (0.0, yb + 0.06 * L, depth + 2.6), 0.05, "metal", segments=6)
    b.box((0.0, yb + 0.06 * L, depth + 2.2), (0.8, 0.08, 0.06), "metal")
    b.box((0.0, yb + 0.06 * L, depth + 2.65), (0.5, 0.1, 0.16), "dark")  # radar
    for y in (0.0, 0.1 * L):
        b.box((0.0, y, depth + 0.2), (W * 1.2, 0.08 * L, 0.4), "superstructure")
        funnel(b, y, depth + 0.35, 0.28, 0.85)
    for side in (-1.0, 1.0):  # torpedo tubes
        b.between((0.25 * side, 0.2 * L, depth + 0.2), (0.25 * side, 0.2 * L - 0.9, depth + 0.2), 0.08, "dark", segments=6)
    gun_turret(b, 0.3 * L, depth + 0.3, 0.8, 1, aft=True)
    b.box((0.0, 0.3 * L, depth + 0.15), (0.6, 0.6, 0.3), "superstructure")
    gun_turret(b, 0.39 * L, depth, 0.8, 1, aft=True)
    b.between((0.0, 0.48 * L, depth), (0.0, 0.48 * L, depth + 0.9), 0.02, "metal", segments=6)
    ensign(b, (0.0, 0.48 * L, depth + 0.88), 0.5, 0.3)


def battleship(b: ShapeBuilder, L: float, beam: float) -> None:
    depth = 1.0
    hull = SteelHull(b, L, beam, depth, bow_flare=0.35, stern_w=0.65, bow_start=0.55)
    W = hull.W
    gun_turret(b, -0.3 * L, depth, 1.5, 3)
    b.cylinder((0.0, -0.2 * L, depth + 0.25), 0.7, 0.5, "superstructure", segments=12)
    gun_turret(b, -0.2 * L, depth + 0.45, 1.5, 3)
    # Superstructure tiers and the tower.
    b.box((0.0, -0.06 * L, depth + 0.4), (W * 1.5, 0.2 * L, 0.8), "superstructure")
    b.box((0.0, -0.1 * L, depth + 1.1), (W * 1.0, 0.1 * L, 0.6), "superstructure")
    b.box((0.0, -0.11 * L, depth + 1.75), (W * 0.75, 0.07 * L, 0.7), "superstructure")
    b.box((0.0, -0.115 * L, depth + 2.3), (W * 0.95, 0.05 * L, 0.4), "team")  # bridge (team)
    windows(b, -0.14 * L - 0.01, depth + 2.32, W * 0.9)
    b.box((0.0, -0.11 * L, depth + 2.7), (0.6, 0.4, 0.4), "superstructure")
    b.box((0.0, -0.11 * L, depth + 3.0), (1.6, 0.25, 0.12), "dark")  # rangefinder
    b.between((0.0, -0.1 * L, depth + 3.0), (0.0, -0.1 * L, depth + 4.0), 0.06, "metal", segments=6)
    funnel(b, 0.02 * L, depth + 0.8, 0.45, 1.3)
    funnel(b, 0.1 * L, depth + 0.8, 0.42, 1.15)
    b.box((0.0, 0.06 * L, depth + 0.4), (W * 1.3, 0.12 * L, 0.8), "superstructure")
    for side in (-1.0, 1.0):  # secondary battery
        for y in (-0.08 * L, 0.02 * L, 0.12 * L):
            with b.placed((W * 0.78 * side, y, depth), yaw=-side * 0.6):
                gun_turret(b, 0.0, 0.0, 0.55, 2)
    b.box((0.0, 0.2 * L, depth + 0.35), (W * 1.0, 0.08 * L, 0.7), "superstructure")
    b.between((0.0, 0.2 * L, depth + 0.7), (0.0, 0.2 * L, depth + 2.6), 0.06, "metal", segments=6)
    gun_turret(b, 0.3 * L, depth, 1.5, 3, aft=True)
    b.between((0.0, 0.48 * L, depth), (0.0, 0.48 * L, depth + 1.2), 0.025, "metal", segments=6)
    ensign(b, (0.0, 0.48 * L, depth + 1.18), 0.7, 0.4)


def _jet(b: ShapeBuilder, s: float) -> None:
    """A tiny parked jet on the flight deck (origin at its centre, nose -Y)."""
    b.between((0.0, 0.55 * s, 0.1 * s), (0.0, -0.6 * s, 0.1 * s), 0.08 * s, "superstructure", segments=6, radius_end=0.03 * s)
    b.extrude([(-0.5 * s, 0.25 * s), (0.5 * s, 0.25 * s), (0.08 * s, -0.25 * s), (-0.08 * s, -0.25 * s)], "z", 0.07 * s, 0.11 * s, "superstructure")
    b.extrude([(0.3 * s, 0.12 * s), (0.58 * s, 0.12 * s), (0.56 * s, 0.42 * s)], "x", -0.02 * s, 0.02 * s, "team")


def carrier(b: ShapeBuilder, L: float, beam: float) -> None:
    depth = 1.0
    SteelHull(b, L, beam, depth, bow_flare=0.4, stern_w=0.85, bow_start=0.6)
    fd = depth + 0.7
    b.box((0.0, 0.0, depth + 0.3), (beam * 0.95, L * 0.84, 0.6), "hull")
    # Flight deck with an angled landing area to port.
    deck = [(-1.35, 0.5 * L + 0.1), (1.55, 0.5 * L + 0.1), (1.95, 0.25 * L), (1.95, -0.1 * L), (1.2, -0.42 * L),
            (0.35, -0.52 * L), (-0.35, -0.52 * L), (-1.25, -0.4 * L), (-2.35, -0.05 * L), (-2.3, 0.2 * L)]
    b.extrude(deck, "z", fd - 0.18, fd, "deck")
    for i in range(9):  # centre line
        b.box((0.15, -0.42 * L + i * 0.1 * L, fd + 0.005), (0.06, 0.05 * L, 0.02), "superstructure")
    with b.placed((-0.85, 0.12 * L, fd + 0.005), yaw=0.16):
        for i in range(5):
            b.box((0.0, -0.22 * L + i * 0.11 * L, 0.0), (0.06, 0.06 * L, 0.02), "superstructure")
    for y in (-0.15 * L, 0.3 * L):  # elevators
        b.box((1.55, y, fd + 0.004), (0.7, 0.07 * L, 0.02), "dark")
    # Island on the starboard edge (team), with bridge, mast, radar and stack.
    yi = 0.08 * L
    b.box((1.6, yi, fd + 0.45), (0.55, 0.16 * L, 0.9), "team")
    b.box((1.6, yi - 0.01 * L, fd + 1.1), (0.5, 0.1 * L, 0.4), "team")
    b.box((1.33, yi - 0.01 * L, fd + 1.12), (0.03, 0.09 * L, 0.12), "glass")
    b.box((1.6, yi + 0.05 * L, fd + 1.2), (0.45, 0.05 * L, 0.6), "dark")  # stack
    b.between((1.6, yi - 0.02 * L, fd + 1.3), (1.6, yi - 0.02 * L, fd + 2.6), 0.05, "metal", segments=6)
    b.box((1.6, yi - 0.02 * L, fd + 2.2), (0.9, 0.12, 0.06), "metal")
    b.box((1.6, yi - 0.02 * L, fd + 2.65), (0.6, 0.1, 0.25), "dark")
    # Parked aircraft aft of the island.
    for x, y in ((1.05, 0.28 * L), (1.05, 0.36 * L), (0.2, 0.42 * L), (-0.6, 0.4 * L)):
        with b.placed((x, y, fd), yaw=0.5 if x > 0.5 else 0.0):
            _jet(b, 1.0)


def submarine(b: ShapeBuilder, L: float, beam: float) -> None:
    R = beam * 0.5
    rings = []
    n = 12
    for i in range(n):
        t = i / (n - 1)  # 0 stern, 1 bow
        y = L * 0.5 - t * L
        if t > 0.85:
            r = R * math.sqrt(max(0.0, 1.0 - ((t - 0.85) / 0.15) ** 2)) * 0.98 + R * 0.02
        elif t < 0.35:
            r = R * (0.12 + 0.88 * math.sin(t / 0.35 * math.pi / 2) ** 0.8)
        else:
            r = R
        r = max(r, R * 0.08)
        rings.append([(r * math.cos(a), y, R + r * math.sin(a)) for a in (k * 2 * math.pi / 10 for k in range(10))])
    b.loft(rings, "hull")
    b.box((0.0, -0.05 * L, 2 * R - 0.02), (R * 0.55, 0.62 * L, 0.12), "deck")  # casing
    # Sail (team) with planes, periscopes and masts.
    ys = -0.16 * L
    sail = [(0.24 * R * math.cos(a), ys + 0.09 * L * math.sin(a)) for a in (k * 2 * math.pi / 12 for k in range(12))]
    b.extrude(sail, "z", 2 * R - 0.05, 2 * R + 1.15 * R, "team")
    b.box((0.0, ys - 0.02 * L, 2 * R + 0.7 * R), (1.3 * R * 2 * 0.7, 0.3, 0.06), "dark")
    for x, h in ((-0.05, 0.6), (0.08, 0.45)):
        b.between((x, ys + 0.02 * L, 3.1 * R), (x, ys + 0.02 * L, 3.1 * R + h), 0.04, "metal", segments=6)
    # Stern cross planes, rudder and screw.
    yt = 0.44 * L
    b.box((0.0, yt, R), (R * 2.4, 0.5, 0.06), "dark")
    b.box((0.0, yt, R), (0.06, 0.5, R * 2.0), "dark")
    b.cylinder((0.0, 0.5 * L + 0.05, R), 0.12, 0.15, "metal", rotation=(math.pi / 2, 0.0, 0.0), segments=8)
    for k in range(3):
        b.box((0.0, 0.5 * L + 0.05, R), (0.05, 0.05, 0.6), "metal", rotation=(0.0, k * math.pi / 3, 0.0))
    b.box((0.0, -0.36 * L, 1.6 * R), (R * 2.6, 0.3, 0.05), "dark")  # bow planes
    b.between((0.0, 0.3 * L, 2 * R + 0.05), (0.0, 0.3 * L, 2 * R + 0.65), 0.02, "metal", segments=4)
    ensign(b, (0.0, 0.3 * L, 2 * R + 0.64), 0.45, 0.28)


BUILDERS: dict[str, Callable[[ShapeBuilder, float, float], None]] = {
    "caravel": caravel,
    "galleon": galleon,
    "frigate": frigate,
    "ironclad": ironclad,
    "transport": transport,
    "destroyer": destroyer,
    "battleship": battleship,
    "carrier": carrier,
    "submarine": submarine,
}
