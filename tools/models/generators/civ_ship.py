"""Civolution ships: lofted hull, mast and sail, oars. Bow points -Y.

Slots: hull, deck, wood, sail, team, metal.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass

import bpy

from blender.generators.civ_common import ShapeBuilder, finish
from blender.lib.spec import AssetSpec, SpecError, as_int, as_str, positive_float, reject_unknown, require_key, require_materials

MATERIAL_SLOTS: tuple[str, ...] = ("hull", "deck", "wood", "sail", "team", "metal")
KINDS = ("galley",)


@dataclass(frozen=True)
class ShipParams:
    kind: str
    length: float
    beam: float
    oars_per_side: int
    seed: int


def parse_params(raw: Mapping[str, object]) -> ShipParams:
    reject_unknown(raw, ("kind", "length", "beam", "oars_per_side", "seed"), "params")
    kind = as_str(require_key(raw, "kind", "params"), "params.kind")
    if kind not in KINDS:
        raise SpecError(f"params.kind must be one of {KINDS}")
    p = ShipParams(
        kind=kind,
        length=positive_float(require_key(raw, "length", "params"), "params.length"),
        beam=positive_float(require_key(raw, "beam", "params"), "params.beam"),
        oars_per_side=as_int(require_key(raw, "oars_per_side", "params"), "params.oars_per_side"),
        seed=as_int(require_key(raw, "seed", "params"), "params.seed"),
    )
    if not 3 <= p.oars_per_side <= 12:
        raise SpecError("params.oars_per_side must be 3..12")
    return p


def _section(y: float, half: float, depth: float, sheer: float) -> list[tuple[float, float, float]]:
    """Hull cross-section ring (counter-clockwise seen from the bow)."""
    return [
        (-half, y, sheer),
        (-half * 0.92, y, depth * 0.55),
        (-half * 0.45, y, depth * 0.12),
        (0.0, y, 0.0),
        (half * 0.45, y, depth * 0.12),
        (half * 0.92, y, depth * 0.55),
        (half, y, sheer),
    ]


def build(spec: AssetSpec) -> list[bpy.types.Object]:
    require_materials(spec.materials, MATERIAL_SLOTS, spec.generator)
    p = parse_params(spec.params)
    b = ShapeBuilder(MATERIAL_SLOTS)
    L = p.length
    W = p.beam * 0.5
    depth = 0.7
    stations = 9
    rings = []
    for i in range(stations):
        t = i / (stations - 1)  # 0 = stern, 1 = bow
        y = L * 0.5 - t * L
        width = W * math.sin(math.pi * (0.12 + 0.82 * t)) ** 0.6
        sheer = depth + 0.35 * (1 - t) ** 3 + 0.25 * t**4
        rings.append(_section(y, max(width, 0.05), depth, sheer))
    b.loft(rings, "hull")
    # Deck planking just inside the rails.
    b.box((0.0, 0.0, depth - 0.04), (W * 1.5, L * 0.72, 0.06), "deck")
    # Bronze ram and stern post.
    b.cylinder((0.0, -L * 0.5 - 0.25, 0.22), 0.13, 0.6, "metal", rotation=(math.pi / 2, 0.0, 0.0), radius_top=0.03, segments=8)
    b.between((0.0, L * 0.47, depth), (0.0, L * 0.58, depth + 0.9), 0.07, "wood", radius_end=0.04)
    # Mast, yard and square sail in team colour with a pale border.
    b.between((0.0, -0.1, depth - 0.05), (0.0, -0.1, depth + 3.3), 0.08, "wood", radius_end=0.05)
    b.between((-1.25, -0.1, depth + 3.0), (1.25, -0.1, depth + 3.0), 0.045, "wood")
    b.box((0.0, -0.06, depth + 2.1), (2.3, 0.04, 1.75), "sail")
    b.box((0.0, -0.09, depth + 2.1), (1.7, 0.03, 1.3), "team")
    # Oars, angled down into the water line.
    for side in (-1.0, 1.0):
        for i in range(p.oars_per_side):
            y = -L * 0.3 + i * (L * 0.6 / max(1, p.oars_per_side - 1))
            b.between((side * W * 0.85, y, depth + 0.05), (side * (W + 1.1), y + 0.15, 0.06), 0.03, "wood")
        # Shields hung on the rail.
        for i in range(p.oars_per_side - 1):
            y = -L * 0.25 + i * (L * 0.5 / max(1, p.oars_per_side - 2))
            b.cylinder((side * (W * 0.97), y, depth + 0.12), 0.16, 0.04, "team", rotation=(0.0, math.pi / 2, 0.0), segments=10)
    obj = b.to_object(spec.asset_id, spec.materials)
    finish(obj)
    return [obj]
