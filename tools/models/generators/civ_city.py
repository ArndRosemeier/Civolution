"""Civolution cities by era and size: the city model on the strategy map.

`era`: ancient (plaster houses, tiled roofs, a temple, a low wall), medieval (timber and
stone houses with steep slate roofs, a church spire, a keep, a curtain wall with towers),
industrial (brick terraces, a factory hall with chimneys, a clock tower, rail-yard sheds)
or modern (concrete and glass blocks and towers, a park). `tier` 1–3 is town, city and
metropolis: more buildings, a wider footprint and taller centres. A team-coloured banner
or roof marks the owner. Origin at the centre, base on Z=0.

Slots: wall, roof, stone, wood, team, brick, glass, metal, concrete, green.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass

import bpy

from blender.generators.civ_common import ShapeBuilder, finish, rng
from blender.lib.spec import AssetSpec, SpecError, as_int, as_str, reject_unknown, require_key, require_materials

MATERIAL_SLOTS: tuple[str, ...] = ("wall", "roof", "stone", "wood", "team", "brick", "glass", "metal", "concrete", "green")
ERAS = ("ancient", "medieval", "industrial", "modern")


@dataclass(frozen=True)
class CityParams:
    era: str
    tier: int
    seed: int


def parse_params(raw: Mapping[str, object]) -> CityParams:
    reject_unknown(raw, ("era", "tier", "seed"), "params")
    era = as_str(require_key(raw, "era", "params"), "params.era")
    if era not in ERAS:
        raise SpecError(f"params.era must be one of {ERAS}")
    tier = as_int(require_key(raw, "tier", "params"), "params.tier")
    if not 1 <= tier <= 3:
        raise SpecError("params.tier must be 1..3")
    return CityParams(era=era, tier=tier, seed=as_int(require_key(raw, "seed", "params"), "params.seed"))


RADIUS = {1: 1.7, 2: 2.25, 3: 2.7}
COUNT = {1: 10, 2: 18, 3: 30}


class Lots:
    """Non-overlapping footprints on rings around the centre."""

    def __init__(self, seed: int, radius: float, keep_clear: float) -> None:
        self.r = rng(seed)
        self.radius = radius
        self.placed: list[tuple[float, float, float]] = [(0.0, 0.0, keep_clear)]

    def take(self, size: float, inner: float = 0.7) -> tuple[float, float] | None:
        for _ in range(200):
            ang = self.r.uniform(0, 2 * math.pi)
            dist = self.r.uniform(inner, self.radius - size)
            x, y = dist * math.cos(ang), dist * math.sin(ang)
            if any(math.hypot(x - px, y - py) < size + ps for px, py, ps in self.placed):
                continue
            # Keep the main street (towards -Y) open.
            if abs(x) < 0.35 and y < -0.6:
                continue
            self.placed.append((x, y, size))
            return x, y
        return None


def _gable_house(b: ShapeBuilder, x: float, y: float, w: float, d: float, h: float, wall: str, roof: str, pitch: float, turn: bool) -> None:
    if turn:
        w, d = d, w
    b.box((x, y, h * 0.5), (w, d, h), wall)
    if turn:
        b.mesh(
            [
                (x - w * 0.5 - 0.06, y - d * 0.5 - 0.06, h), (x + w * 0.5 + 0.06, y - d * 0.5 - 0.06, h), (x, y - d * 0.5 - 0.06, h + w * pitch),
                (x - w * 0.5 - 0.06, y + d * 0.5 + 0.06, h), (x + w * 0.5 + 0.06, y + d * 0.5 + 0.06, h), (x, y + d * 0.5 + 0.06, h + w * pitch),
            ],
            [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (0, 3, 5, 2)],
            roof,
        )
    else:
        b.prism_roof((x, y, h), w, d, d * pitch, roof, overhang=0.06)


def _wall_ring(b: ShapeBuilder, radius: float, height: float, slot: str, towers: int, tower_slot: str, cap_slot: str) -> None:
    segments = 32
    for i in range(segments):
        a0 = 2 * math.pi * i / segments
        a1 = 2 * math.pi * (i + 1) / segments
        mid = (a0 + a1) * 0.5
        if abs(mid - 1.5 * math.pi) < 0.12:
            continue  # gate facing -Y
        x0, y0 = radius * math.cos(a0), radius * math.sin(a0)
        x1, y1 = radius * math.cos(a1), radius * math.sin(a1)
        b.box(((x0 + x1) / 2, (y0 + y1) / 2, height / 2), (math.hypot(x1 - x0, y1 - y0) + 0.03, 0.13, height), slot, rotation=(0.0, 0.0, mid + math.pi / 2))
    for k in range(towers):
        a = 2 * math.pi * k / towers + math.pi / towers
        tx, ty = radius * math.cos(a), radius * math.sin(a)
        b.cylinder((tx, ty, height * 0.8), 0.16, height * 1.6, tower_slot, segments=10)
        b.cone((tx, ty, height * 1.6), 0.2, 0.3, cap_slot, segments=10)
    for gx in (-0.28, 0.28):
        b.cylinder((gx, -radius, height * 0.85), 0.15, height * 1.7, tower_slot, segments=10)
        b.cone((gx, -radius, height * 1.7), 0.19, 0.28, cap_slot, segments=10)


def _banner(b: ShapeBuilder, x: float, y: float, height: float) -> None:
    b.between((x, y, 0.0), (x, y, height), 0.03, "wood")
    b.box((x + 0.22, y, height - 0.18), (0.42, 0.03, 0.34), "team")


def _ancient(b: ShapeBuilder, p: CityParams) -> None:
    R = RADIUS[p.tier]
    lots = Lots(p.seed, R - 0.1, 0.62)
    # Temple on a stepped base.
    s = 0.7 + 0.15 * p.tier
    b.box((0.0, 0.0, 0.1), (1.4 * s, 1.0 * s, 0.2), "stone")
    b.box((0.0, 0.0, 0.26), (1.15 * s, 0.82 * s, 0.12), "stone")
    for ix in (-1, 0, 1):
        for iy in (-1, 1):
            b.cylinder((ix * 0.44 * s, iy * 0.31 * s, 0.68), 0.06, 0.75, "stone", segments=8)
    b.box((0.0, 0.0, 1.08), (1.2 * s, 0.88 * s, 0.09), "stone")
    b.prism_roof((0.0, 0.0, 1.12), 1.2 * s, 0.88 * s, 0.32, "roof", overhang=0.05)
    _banner(b, 0.85, 0.7, 2.0 + 0.2 * p.tier)
    for _ in range(COUNT[p.tier]):
        w, d = lots.r.uniform(0.42, 0.7), lots.r.uniform(0.38, 0.55)
        spot = lots.take(max(w, d) * 0.6)
        if spot is None:
            break
        _gable_house(b, spot[0], spot[1], w, d, lots.r.uniform(0.34, 0.55), "wall", "roof", 0.42, lots.r.random() < 0.5)
    if p.tier >= 2:
        # A colonnaded market hall.
        spot = lots.take(0.65)
        if spot:
            b.box((spot[0], spot[1], 0.06), (1.0, 0.6, 0.12), "stone")
            for k in range(4):
                b.cylinder((spot[0] - 0.36 + k * 0.24, spot[1] - 0.22, 0.32), 0.04, 0.45, "stone", segments=6)
            b.prism_roof((spot[0], spot[1], 0.55), 1.0, 0.6, 0.22, "roof", overhang=0.04)
    _wall_ring(b, R, 0.42, "stone", 0 if p.tier == 1 else 4 + 2 * p.tier, "stone", "roof")


def _medieval(b: ShapeBuilder, p: CityParams) -> None:
    R = RADIUS[p.tier]
    lots = Lots(p.seed + 7, R - 0.12, 0.72)
    # Church with a spire.
    b.box((0.25, 0.0, 0.42), (1.1, 0.55, 0.84), "stone")
    b.prism_roof((0.25, 0.0, 0.84), 1.1, 0.55, 0.38, "roof", overhang=0.05)
    b.box((-0.45, 0.0, 0.75), (0.38, 0.38, 1.5), "stone")
    b.cone((-0.45, 0.0, 1.5), 0.3, 0.9 + 0.15 * p.tier, "roof", segments=4)
    # Keep for larger towns.
    if p.tier >= 2:
        kx, ky = 0.0, 0.95
        b.box((kx, ky, 0.65), (0.6, 0.6, 1.3), "stone")
        for cx in (-0.22, 0.22):
            for cy in (-0.22, 0.22):
                b.box((kx + cx, ky + cy, 1.38), (0.14, 0.14, 0.16), "stone")
        _banner(b, kx, ky, 2.3)
        lots.placed.append((kx, ky, 0.5))
    else:
        _banner(b, 0.9, 0.45, 1.8)
    for _ in range(COUNT[p.tier] + 2):
        w, d = lots.r.uniform(0.36, 0.55), lots.r.uniform(0.34, 0.5)
        spot = lots.take(max(w, d) * 0.58)
        if spot is None:
            break
        wall = "wall" if lots.r.random() < 0.6 else "wood"
        _gable_house(b, spot[0], spot[1], w, d, lots.r.uniform(0.4, 0.62), wall, "roof", 0.75, lots.r.random() < 0.5)
    _wall_ring(b, R, 0.55, "stone", 4 + 2 * p.tier, "stone", "roof")


def _industrial(b: ShapeBuilder, p: CityParams) -> None:
    R = RADIUS[p.tier]
    lots = Lots(p.seed + 13, R, 0.72)
    # Town hall with a clock tower.
    b.box((0.0, 0.0, 0.4), (1.2, 0.7, 0.8), "brick")
    b.prism_roof((0.0, 0.0, 0.8), 1.2, 0.7, 0.25, "roof", overhang=0.04)
    b.box((0.0, 0.0, 1.1), (0.32, 0.32, 0.9), "stone")
    b.cylinder((0.0, -0.17, 1.3), 0.11, 0.02, "glass", rotation=(math.pi / 2, 0.0, 0.0), segments=14)
    b.cone((0.0, 0.0, 1.55), 0.24, 0.45, "metal", segments=4)
    _banner(b, 0.75, 0.0, 2.2)
    # Factory hall with saw-tooth roof and chimneys.
    fx, fy = (-R + 0.75, R * 0.35)
    lots.placed.append((fx, fy, 0.75))
    b.box((fx, fy, 0.3), (1.0, 0.75, 0.6), "brick")
    for k in range(3):
        b.mesh(
            [(fx - 0.5, fy - 0.375 + k * 0.25, 0.6), (fx + 0.5, fy - 0.375 + k * 0.25, 0.6), (fx + 0.5, fy - 0.375 + k * 0.25, 0.85),
             (fx - 0.5, fy - 0.375 + k * 0.25, 0.85), (fx - 0.5, fy - 0.125 + k * 0.25, 0.6), (fx + 0.5, fy - 0.125 + k * 0.25, 0.6)],
            [(0, 1, 2, 3), (0, 3, 4), (1, 5, 2), (0, 4, 5, 1), (3, 2, 5, 4)],
            "metal",
        )
    for k in range(p.tier):
        b.cylinder((fx - 0.3 + k * 0.3, fy + 0.5, 0.75), 0.08, 1.5, "brick", segments=10)
    # Brick terraces.
    for _ in range(COUNT[p.tier]):
        w, d = lots.r.uniform(0.42, 0.7), lots.r.uniform(0.3, 0.4)
        spot = lots.take(max(w, d) * 0.52)
        if spot is None:
            break
        h = lots.r.uniform(0.3, 0.48) + 0.06 * p.tier
        _gable_house(b, spot[0], spot[1], w, d, h, "brick" if lots.r.random() < 0.7 else "wall", "roof", 0.35, lots.r.random() < 0.5)
    # Station shed and a water tower.
    spot = lots.take(0.5)
    if spot:
        b.box((spot[0], spot[1], 0.25), (0.9, 0.4, 0.5), "wood")
        b.prism_roof((spot[0], spot[1], 0.5), 0.9, 0.4, 0.14, "metal", overhang=0.05)
    spot = lots.take(0.25)
    if spot:
        for cx, cy in ((-0.08, -0.08), (0.08, -0.08), (-0.08, 0.08), (0.08, 0.08)):
            b.between((spot[0] + cx, spot[1] + cy, 0.0), (spot[0] + cx * 0.6, spot[1] + cy * 0.6, 0.7), 0.02, "metal")
        b.cylinder((spot[0], spot[1], 0.85), 0.16, 0.3, "metal", segments=12)


def _modern(b: ShapeBuilder, p: CityParams) -> None:
    R = RADIUS[p.tier]
    lots = Lots(p.seed + 21, R, 0.55)
    # Central tower(s), taller with tier.
    heights = {1: [1.1], 2: [1.6, 1.2], 3: [2.4, 1.8, 1.4]}[p.tier]
    centres = [(0.0, 0.0), (0.5, 0.35), (-0.45, 0.4)]
    for (cx, cy), h in zip(centres, heights):
        b.box((cx, cy, h / 2), (0.42, 0.42, h), "glass")
        b.box((cx, cy, h + 0.04), (0.46, 0.46, 0.08), "concrete")
        lots.placed.append((cx, cy, 0.36))
    b.between((0.0, 0.0, heights[0]), (0.0, 0.0, heights[0] + 0.45), 0.02, "metal")
    b.box((0.0, 0.0, heights[0] - 0.08), (0.44, 0.44, 0.06), "team")
    # Park with trees.
    px, py = (-R * 0.45, -R * 0.4)
    lots.placed.append((px, py, 0.5))
    b.box((px, py, 0.02), (0.9, 0.7, 0.04), "green")
    for k in range(5):
        tx = px - 0.3 + (k % 3) * 0.3
        ty = py - 0.18 + (k // 3) * 0.36
        b.between((tx, ty, 0.0), (tx, ty, 0.18), 0.025, "wood")
        b.sphere((tx, ty, 0.26), 0.12, "green", detail=1)
    for _ in range(COUNT[p.tier] + 8):
        w, d = lots.r.uniform(0.3, 0.52), lots.r.uniform(0.3, 0.48)
        spot = lots.take(max(w, d) * 0.58, inner=0.6)
        if spot is None:
            break
        dist = math.hypot(*spot)
        h = max(0.3, (1.0 - dist / R) * (0.6 + 0.45 * p.tier) + lots.r.uniform(0.0, 0.35))
        slot = "glass" if lots.r.random() < 0.45 else "concrete"
        b.box((spot[0], spot[1], h / 2), (w, d, h), slot)
        b.box((spot[0], spot[1], h + 0.03), (w * 0.4, d * 0.4, 0.06), "metal")


BUILDERS = {"ancient": _ancient, "medieval": _medieval, "industrial": _industrial, "modern": _modern}


def build(spec: AssetSpec) -> list[bpy.types.Object]:
    require_materials(spec.materials, MATERIAL_SLOTS, spec.generator)
    p = parse_params(spec.params)
    b = ShapeBuilder(MATERIAL_SLOTS)
    BUILDERS[p.era](b, p)
    obj = b.to_object(spec.asset_id, spec.materials)
    finish(obj)
    return [obj]
