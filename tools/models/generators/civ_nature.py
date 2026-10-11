"""Civolution map dressing: very low-poly trees and props for GPU instancing.

Thousands of these are drawn per frame on a Huge map, so each stays within a
few hundred triangles. Kinds: pine, broadleaf, palm, jungle, reed, mine.
Slots: bark, leaves, leaves_dark, stone, wood.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass

import bpy

from blender.generators.civ_common import ShapeBuilder, finish, rng
from blender.lib.spec import AssetSpec, SpecError, as_int, as_str, reject_unknown, require_key, require_materials

MATERIAL_SLOTS: tuple[str, ...] = ("bark", "leaves", "leaves_dark", "stone", "wood")
KINDS = ("pine", "broadleaf", "palm", "jungle", "reed", "mine")


@dataclass(frozen=True)
class NatureParams:
    kind: str
    seed: int


def parse_params(raw: Mapping[str, object]) -> NatureParams:
    reject_unknown(raw, ("kind", "seed"), "params")
    kind = as_str(require_key(raw, "kind", "params"), "params.kind")
    if kind not in KINDS:
        raise SpecError(f"params.kind must be one of {KINDS}")
    return NatureParams(kind=kind, seed=as_int(require_key(raw, "seed", "params"), "params.seed"))


def build(spec: AssetSpec) -> list[bpy.types.Object]:
    require_materials(spec.materials, MATERIAL_SLOTS, spec.generator)
    p = parse_params(spec.params)
    r = rng(p.seed)
    b = ShapeBuilder(MATERIAL_SLOTS)
    if p.kind == "pine":
        b.cylinder((0.0, 0.0, 0.35), 0.12, 0.7, "bark", segments=6, radius_top=0.08)
        for i, (z, rad) in enumerate(((0.45, 0.85), (1.1, 0.68), (1.7, 0.48))):
            b.cone((0.0, 0.0, z), rad, 1.0 - i * 0.12, "leaves_dark" if i % 2 == 0 else "leaves", segments=7)
    elif p.kind == "broadleaf":
        b.cylinder((0.0, 0.0, 0.55), 0.12, 1.1, "bark", segments=6, radius_top=0.08)
        b.between((0.0, 0.0, 0.9), (0.35, 0.1, 1.35), 0.05, "bark", segments=5)
        for _ in range(4):
            c = (r.uniform(-0.35, 0.35), r.uniform(-0.35, 0.35), r.uniform(1.4, 1.9))
            b.sphere(c, (r.uniform(0.45, 0.6), r.uniform(0.45, 0.6), r.uniform(0.38, 0.5)), r.choice(["leaves", "leaves_dark"]), detail=1)
    elif p.kind == "palm":
        lean = 0.35
        b.between((0.0, 0.0, 0.0), (lean, 0.0, 2.2), 0.1, "bark", segments=6, radius_end=0.07)
        for k in range(6):
            a = 2 * math.pi * k / 6 + r.uniform(-0.2, 0.2)
            tip = (lean + math.cos(a) * 1.05, math.sin(a) * 1.05, 1.75)
            b.between((lean, 0.0, 2.2), tip, 0.09, "leaves" if k % 2 else "leaves_dark", segments=4, radius_end=0.02)
        b.sphere((lean, 0.0, 2.15), 0.13, "bark", detail=1)
    elif p.kind == "jungle":
        b.cylinder((0.0, 0.0, 0.8), 0.13, 1.6, "bark", segments=6, radius_top=0.09)
        b.sphere((0.0, 0.0, 1.9), (0.8, 0.8, 0.45), "leaves_dark", detail=1)
        for _ in range(3):
            c = (r.uniform(-0.7, 0.7), r.uniform(-0.7, 0.7), r.uniform(0.35, 0.6))
            b.sphere(c, (0.38, 0.38, 0.32), "leaves", detail=1)
    elif p.kind == "reed":
        for _ in range(9):
            x, y = r.uniform(-0.5, 0.5), r.uniform(-0.5, 0.5)
            h = r.uniform(0.5, 0.9)
            b.between((x, y, 0.0), (x + r.uniform(-0.08, 0.08), y + r.uniform(-0.08, 0.08), h), 0.025, "leaves", segments=4, radius_end=0.008)
            b.sphere((x, y, h * 0.8), (0.035, 0.035, 0.09), "bark", detail=1)
    elif p.kind == "mine":
        # Timbered adit in a spoil heap with a cart of ore.
        b.sphere((0.0, 0.25, 0.0), (0.9, 0.7, 0.45), "stone", detail=2)
        for sx in (-0.28, 0.28):
            b.box((sx, -0.38, 0.32), (0.09, 0.09, 0.64), "wood")
        b.box((0.0, -0.38, 0.66), (0.72, 0.1, 0.09), "wood")
        b.box((0.0, -0.33, 0.3), (0.46, 0.04, 0.56), "bark")
        b.box((0.55, -0.7, 0.2), (0.34, 0.24, 0.18), "wood")
        b.sphere((0.55, -0.7, 0.3), (0.15, 0.1, 0.08), "stone", detail=1)
    obj = b.to_object(spec.asset_id, spec.materials)
    finish(obj)
    return [obj]
