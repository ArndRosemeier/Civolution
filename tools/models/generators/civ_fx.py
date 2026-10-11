"""Civolution map effects: a scorched blast crater for nuclear strike sites.

Flat and wide, origin at the centre, base on Z=0. The ground is a lathed mound
(a loft of concentric rings, capped flat underneath) with a raised rim; scorch,
ash streaks, rubble and a few embers sit on top as separate closed shells.
Slots: soil, scorch, ash, rubble, ember.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass

import bpy

from blender.generators.civ_common import ShapeBuilder, finish, rng
from blender.lib.spec import AssetSpec, SpecError, as_int, as_str, reject_unknown, require_key, require_materials

MATERIAL_SLOTS: tuple[str, ...] = ("soil", "scorch", "ash", "rubble", "ember")
KINDS = ("crater",)


@dataclass(frozen=True)
class FxParams:
    kind: str
    seed: int


def parse_params(raw: Mapping[str, object]) -> FxParams:
    reject_unknown(raw, ("kind", "seed"), "params")
    kind = as_str(require_key(raw, "kind", "params"), "params.kind")
    if kind not in KINDS:
        raise SpecError(f"params.kind must be one of {KINDS}")
    return FxParams(kind=kind, seed=as_int(require_key(raw, "seed", "params"), "params.seed"))


def _crater(b: ShapeBuilder, seed: int) -> None:
    r = rng(seed)
    n = 18
    wobble = [r.uniform(0.9, 1.1) for _ in range(n)]
    profile = ((0.12, 0.05), (0.42, 0.06), (0.68, 0.13), (0.86, 0.24), (1.0, 0.2), (1.18, 0.09), (1.42, 0.0))
    rings = []
    for rad, z in profile:
        rings.append([(rad * wobble[i] * math.cos(2 * math.pi * i / n), rad * wobble[i] * math.sin(2 * math.pi * i / n), z) for i in range(n)])
    b.loft(rings, "soil")
    # Scorched floor and glassy centre, a little above the soil.
    floor = [(0.62 * wobble[i] * math.cos(2 * math.pi * i / n), 0.62 * wobble[i] * math.sin(2 * math.pi * i / n)) for i in range(n)]
    b.extrude(floor, "z", 0.05, 0.11, "scorch")
    b.cylinder((0.0, 0.0, 0.115), 0.22, 0.02, "ember", segments=9)
    # Ash streaks thrown out radially over the rim and onto the ground.
    for i in range(9):
        a = 2 * math.pi * i / 9 + r.uniform(-0.25, 0.25)
        reach = 1.3 + r.uniform(0.2, 0.5)
        w0 = r.uniform(0.22, 0.34)
        w1 = w0 * r.uniform(0.3, 0.5)
        ca, sa = math.cos(a), math.sin(a)
        outline = [(ca * 1.15 - sa * w0, sa * 1.15 + ca * w0), (ca * reach - sa * w1, sa * reach + ca * w1),
                   (ca * (reach + 0.08), sa * (reach + 0.08)), (ca * reach + sa * w1, sa * reach - ca * w1),
                   (ca * 1.15 + sa * w0, sa * 1.15 - ca * w0)]
        b.extrude(outline, "z", 0.0, 0.03, "scorch" if i % 3 else "ash")
    # Rubble chunks on the rim and slopes, a few embers in the pit.
    for i in range(22):
        a = r.uniform(0, 2 * math.pi)
        d = r.uniform(0.7, 1.35)
        z = 0.24 - abs(d - 0.95) * 0.5
        s = r.uniform(0.04, 0.09)
        b.sphere((d * math.cos(a), d * math.sin(a), max(z, 0.03)), (s * r.uniform(0.8, 1.4), s * r.uniform(0.8, 1.4), s * 0.7), "rubble", detail=1)
    for i in range(5):
        a = r.uniform(0, 2 * math.pi)
        d = r.uniform(0.1, 0.45)
        b.sphere((d * math.cos(a), d * math.sin(a), 0.12), 0.035, "ember", detail=1)
    # Two broken beams sticking out of the rim.
    b.between((0.8, 0.35, 0.18), (1.05, 0.5, 0.42), 0.035, "rubble", segments=4)
    b.between((-0.6, -0.75, 0.18), (-0.85, -0.95, 0.36), 0.03, "rubble", segments=4)


def build(spec: AssetSpec) -> list[bpy.types.Object]:
    require_materials(spec.materials, MATERIAL_SLOTS, spec.generator)
    p = parse_params(spec.params)
    b = ShapeBuilder(MATERIAL_SLOTS)
    _crater(b, p.seed)
    obj = b.to_object(spec.asset_id, spec.materials)
    finish(obj)
    return [obj]
