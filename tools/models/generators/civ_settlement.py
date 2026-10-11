"""Civolution settlements: an ancient town cluster or a tribal village.

`style: "town"`: plastered houses with tiled roofs around a temple, low wall with
gate towers, a team-coloured banner. `style: "village"`: round thatched huts around
a fire and a totem. Origin at the centre, base on Z=0.

Slots: wall, roof, stone, wood, team, thatch, fire.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass

import bpy

from blender.generators.civ_common import ShapeBuilder, finish, rng
from blender.lib.spec import AssetSpec, SpecError, as_bool, as_int, as_str, positive_float, reject_unknown, require_key, require_materials

MATERIAL_SLOTS: tuple[str, ...] = ("wall", "roof", "stone", "wood", "team", "thatch", "fire")


@dataclass(frozen=True)
class SettlementParams:
    style: str
    radius: float
    buildings: int
    walls: bool
    seed: int


def parse_params(raw: Mapping[str, object]) -> SettlementParams:
    reject_unknown(raw, ("style", "radius", "buildings", "walls", "seed"), "params")
    style = as_str(require_key(raw, "style", "params"), "params.style")
    if style not in ("town", "village"):
        raise SpecError("params.style must be town or village")
    p = SettlementParams(
        style=style,
        radius=positive_float(require_key(raw, "radius", "params"), "params.radius"),
        buildings=as_int(require_key(raw, "buildings", "params"), "params.buildings"),
        walls=as_bool(require_key(raw, "walls", "params"), "params.walls"),
        seed=as_int(require_key(raw, "seed", "params"), "params.seed"),
    )
    if not 2 <= p.buildings <= 40:
        raise SpecError("params.buildings must be 2..40")
    return p


def _house(b: ShapeBuilder, x: float, y: float, w: float, d: float, h: float, turn: bool) -> None:
    if turn:
        w, d = d, w
    b.box((x, y, h * 0.5), (w, d, h), "wall")
    if turn:
        # Prism roof runs along X; rotate by building the roof along Y via a swapped footprint.
        b.mesh(
            [
                (x - w * 0.5 - 0.08, y - d * 0.5 - 0.08, h), (x + w * 0.5 + 0.08, y - d * 0.5 - 0.08, h), (x, y - d * 0.5 - 0.08, h + w * 0.45),
                (x - w * 0.5 - 0.08, y + d * 0.5 + 0.08, h), (x + w * 0.5 + 0.08, y + d * 0.5 + 0.08, h), (x, y + d * 0.5 + 0.08, h + w * 0.45),
            ],
            [(0, 2, 1), (3, 4, 5), (0, 1, 4, 3), (1, 2, 5, 4), (0, 3, 5, 2)],
            "roof",
        )
    else:
        b.prism_roof((x, y, h), w, d, d * 0.45, "roof", overhang=0.08)
    b.box((x, y - (d * 0.5 if not turn else d * 0.5), h * 0.3), (0.22, 0.04, h * 0.55), "wood")  # door


def _town(b: ShapeBuilder, p: SettlementParams) -> None:
    r = rng(p.seed)
    R = p.radius
    # Temple on a stepped stone base at the centre.
    b.box((0.0, 0.0, 0.12), (1.5, 1.1, 0.24), "stone")
    b.box((0.0, 0.0, 0.3), (1.25, 0.9, 0.14), "stone")
    for ix in (-1, 0, 1):
        for iy in (-1, 1):
            b.cylinder((ix * 0.48, iy * 0.34, 0.75), 0.07, 0.8, "stone", segments=8)
    b.box((0.0, 0.0, 1.18), (1.3, 0.95, 0.1), "stone")
    b.prism_roof((0.0, 0.0, 1.23), 1.3, 0.95, 0.35, "roof", overhang=0.05)
    # Banner.
    b.between((0.95, 0.75, 0.0), (0.95, 0.75, 2.4), 0.035, "wood")
    b.box((1.2, 0.75, 2.12), (0.5, 0.03, 0.42), "team")
    # Houses on rings around the temple, avoiding overlaps.
    placed: list[tuple[float, float, float]] = [(0.0, 0.0, 1.0)]
    attempts = 0
    while len(placed) - 1 < p.buildings and attempts < 600:
        attempts += 1
        ang = r.uniform(0, 2 * math.pi)
        dist = r.uniform(1.0, R - 0.45)
        x, y = dist * math.cos(ang), dist * math.sin(ang)
        w = r.uniform(0.45, 0.75)
        d = r.uniform(0.4, 0.6)
        size = max(w, d) * 0.62
        if any(math.hypot(x - px, y - py) < size + ps for px, py, ps in placed):
            continue
        if p.walls and abs(y + R) < 0.9 and abs(x) < 0.6:
            continue  # keep the gate street clear
        placed.append((x, y, size))
        _house(b, x, y, w, d, r.uniform(0.38, 0.62), r.random() < 0.5)
    if p.walls:
        segments = 28
        for i in range(segments):
            a0 = 2 * math.pi * i / segments
            a1 = 2 * math.pi * (i + 1) / segments
            mid = (a0 + a1) * 0.5
            if abs(mid - 1.5 * math.pi) < 0.15:
                continue  # gate facing -Y
            x0, y0 = R * math.cos(a0), R * math.sin(a0)
            x1, y1 = R * math.cos(a1), R * math.sin(a1)
            b.box(((x0 + x1) / 2, (y0 + y1) / 2, 0.22), (math.hypot(x1 - x0, y1 - y0) + 0.03, 0.14, 0.44), "stone", rotation=(0.0, 0.0, mid + math.pi / 2))
        for gx in (-0.3, 0.3):
            b.cylinder((gx, -R, 0.36), 0.17, 0.72, "stone", segments=10)
            b.cone((gx, -R, 0.72), 0.2, 0.3, "roof", segments=10)


def _village(b: ShapeBuilder, p: SettlementParams) -> None:
    r = rng(p.seed)
    R = p.radius
    for i in range(p.buildings):
        ang = 2 * math.pi * i / p.buildings + r.uniform(-0.25, 0.25)
        dist = R * r.uniform(0.55, 0.8)
        x, y = dist * math.cos(ang), dist * math.sin(ang)
        rad = r.uniform(0.32, 0.45)
        h = r.uniform(0.32, 0.42)
        b.cylinder((x, y, h * 0.5), rad, h, "wall", segments=12)
        b.cone((x, y, h - 0.02), rad * 1.3, rad * 1.25, "thatch", segments=12)
        b.box((x - math.cos(ang) * rad, y - math.sin(ang) * rad, h * 0.35), (0.06, 0.18, h * 0.6), "wood", rotation=(0.0, 0.0, ang))
    # Fire ring and totem.
    for i in range(8):
        a = 2 * math.pi * i / 8
        b.sphere((0.28 * math.cos(a), 0.28 * math.sin(a), 0.05), 0.07, "stone", detail=1)
    b.cone((0.0, 0.0, 0.0), 0.18, 0.4, "fire", segments=7)
    b.between((0.0, 0.55, 0.0), (0.0, 0.55, 1.3), 0.07, "wood")
    for k in range(3):
        b.box((0.0, 0.55, 0.45 + k * 0.32), (0.2, 0.17, 0.18), "roof")
    b.box((0.0, 0.55, 1.18), (0.55, 0.06, 0.08), "wood")


def build(spec: AssetSpec) -> list[bpy.types.Object]:
    require_materials(spec.materials, MATERIAL_SLOTS, spec.generator)
    p = parse_params(spec.params)
    b = ShapeBuilder(MATERIAL_SLOTS)
    if p.style == "town":
        _town(b, p)
    else:
        _village(b, p)
    obj = b.to_object(spec.asset_id, spec.materials)
    finish(obj)
    return [obj]
