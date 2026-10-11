"""Civolution foot units: a stylised low-poly figure plus kit per role.

Faces -Y. Roughly 1.8 m tall; the game scales it to the tile. Slots: skin, hair,
cloth, team (tinted per civilization in game), leather, wood, metal.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass

import bpy

from blender.generators.civ_common import ShapeBuilder, finish
from blender.lib.spec import AssetSpec, SpecError, as_int, as_str, reject_unknown, require_key, require_materials

MATERIAL_SLOTS: tuple[str, ...] = ("skin", "hair", "cloth", "team", "leather", "wood", "metal")
KINDS = ("warrior", "settler", "worker", "scout", "explorer", "spearman", "archer")


@dataclass(frozen=True)
class FigureParams:
    kind: str
    seed: int


def parse_params(raw: Mapping[str, object]) -> FigureParams:
    reject_unknown(raw, ("kind", "seed"), "params")
    kind = as_str(require_key(raw, "kind", "params"), "params.kind")
    if kind not in KINDS:
        raise SpecError(f"params.kind must be one of {KINDS}, got {kind!r}")
    return FigureParams(kind=kind, seed=as_int(require_key(raw, "seed", "params"), "params.seed"))


def _body(b: ShapeBuilder, kind: str) -> None:
    bare_legs = kind in ("warrior", "spearman")
    legs = "skin" if bare_legs else "cloth"
    for sx in (-1.0, 1.0):
        x = 0.1 * sx
        b.box((x, -0.04, 0.045), (0.11, 0.24, 0.09), "leather")
        b.between((x, 0.0, 0.08), (x, 0.0, 0.84), 0.068, legs, radius_end=0.075)
    # Tunic skirt, torso, belt.
    b.cylinder((0.0, 0.0, 0.79), 0.25, 0.18, "team", radius_top=0.21, segments=12)
    b.cylinder((0.0, 0.0, 1.13), 0.2, 0.52, "team", radius_top=0.18, segments=12)
    b.cylinder((0.0, 0.0, 0.89), 0.215, 0.07, "leather", segments=12)
    b.box((0.0, -0.215, 0.89), (0.07, 0.03, 0.06), "metal")  # buckle
    b.box((0.0, -0.235, 0.74), (0.14, 0.03, 0.22), "cloth")  # front flap
    b.sphere((0.0, 0.09, 1.53), (0.09, 0.06, 0.07), "hair", detail=1)  # hair at the nape
    # Neck and head.
    b.cylinder((0.0, 0.0, 1.43), 0.06, 0.1, "skin", segments=8)
    b.sphere((0.0, 0.0, 1.58), (0.12, 0.125, 0.145), "skin")
    b.sphere((0.0, -0.11, 1.57), (0.025, 0.03, 0.03), "skin", detail=1)  # nose


def _arm(b: ShapeBuilder, side: float, hand: tuple[float, float, float], sleeve: str = "skin") -> None:
    shoulder = (0.22 * side, 0.0, 1.34)
    elbow = (0.27 * side, 0.03, 1.08)
    b.sphere(shoulder, 0.075, "team", detail=1)
    b.between(shoulder, elbow, 0.055, sleeve)
    b.between(elbow, hand, 0.05, "skin", radius_end=0.045)
    b.sphere(hand, 0.055, "skin", detail=1)


def _hair(b: ShapeBuilder) -> None:
    b.sphere((0.0, 0.02, 1.63), (0.127, 0.125, 0.11), "hair")


def build(spec: AssetSpec) -> list[bpy.types.Object]:
    require_materials(spec.materials, MATERIAL_SLOTS, spec.generator)
    p = parse_params(spec.params)
    b = ShapeBuilder(MATERIAL_SLOTS)
    _body(b, p.kind)
    right = (0.27, -0.16, 0.92)
    left = (-0.27, -0.12, 0.95)
    k = p.kind
    if k == "warrior":
        _hair(b)
        b.cylinder((0.0, 0.0, 1.62), 0.13, 0.04, "team", segments=12)  # headband
        b.cylinder((0.0, 0.03, 1.36), 0.27, 0.12, "leather", radius_top=0.12, segments=10)  # fur collar
        _arm(b, 1.0, right)
        _arm(b, -1.0, left)
        b.between(right, (0.33, -0.42, 1.48), 0.03, "wood", radius_end=0.075)  # club
        b.sphere((0.33, -0.43, 1.5), 0.085, "wood", detail=1)
        b.cylinder((-0.36, -0.08, 1.0), 0.27, 0.05, "leather", rotation=(0.0, math.pi / 2, 0.0), segments=14)
        b.sphere((-0.4, -0.08, 1.0), 0.06, "metal", detail=1)
    elif k == "spearman":
        _hair(b)
        b.cylinder((0.0, 0.0, 1.66), 0.135, 0.12, "metal", radius_top=0.1, segments=12)
        _arm(b, 1.0, right)
        _arm(b, -1.0, left)
        b.between((0.27, -0.16, 0.05), (0.27, -0.16, 2.3), 0.025, "wood")
        b.cone((0.27, -0.16, 2.3), 0.045, 0.22, "metal", segments=6)
        b.cylinder((-0.36, -0.08, 1.0), 0.3, 0.05, "team", rotation=(0.0, math.pi / 2, 0.0), segments=14)
    elif k == "archer":
        _hair(b)
        b.sphere((0.0, 0.02, 1.66), (0.14, 0.14, 0.09), "team", detail=1)  # cap
        _arm(b, 1.0, (0.2, -0.3, 1.25))
        _arm(b, -1.0, (-0.25, -0.45, 1.3))
        b.between((-0.27, -0.45, 0.75), (-0.27, -0.5, 1.3), 0.02, "wood")
        b.between((-0.27, -0.5, 1.3), (-0.27, -0.45, 1.85), 0.02, "wood")
        b.box((0.0, 0.2, 1.15), (0.1, 0.1, 0.5), "leather", rotation=(0.3, 0.0, 0.2))  # quiver
    elif k == "settler":
        b.cylinder((0.0, 0.0, 1.71), 0.24, 0.03, "leather", segments=14)  # brim
        b.cylinder((0.0, 0.0, 1.77), 0.13, 0.11, "leather", radius_top=0.11, segments=12)
        _arm(b, 1.0, right, "cloth")
        _arm(b, -1.0, left, "cloth")
        b.between((0.28, -0.18, 0.04), (0.28, -0.18, 1.75), 0.025, "wood")
        b.box((0.0, 0.22, 1.12), (0.38, 0.22, 0.5), "leather")
        b.cylinder((0.0, 0.24, 1.43), 0.1, 0.5, "cloth", rotation=(0.0, math.pi / 2, 0.0), segments=10)
        b.box((0.0, 0.34, 1.0), (0.2, 0.06, 0.2), "team")
    elif k == "worker":
        _hair(b)
        b.sphere((0.0, 0.01, 1.66), (0.135, 0.135, 0.07), "cloth", detail=1)  # cap
        _arm(b, 1.0, (0.24, -0.12, 1.18), "cloth")
        _arm(b, -1.0, left, "cloth")
        b.between((0.25, -0.2, 1.05), (0.12, 0.3, 1.62), 0.025, "wood")
        b.box((0.12, 0.3, 1.64), (0.5, 0.06, 0.06), "metal", rotation=(0.0, 0.0, 0.3))
        b.box((-0.36, -0.12, 0.62), (0.08, 0.04, 0.3), "metal")  # shovel blade in left hand
        b.between((-0.36, -0.12, 0.77), (-0.27, -0.12, 0.95), 0.02, "wood")
    elif k == "scout":
        b.sphere((0.0, 0.03, 1.6), (0.15, 0.15, 0.17), "team", detail=2)  # hood
        b.cylinder((0.0, 0.06, 1.0), 0.27, 0.75, "cloth", radius_top=0.19, segments=12)  # cloak
        _arm(b, 1.0, right, "cloth")
        _arm(b, -1.0, left, "cloth")
        b.between((0.28, -0.18, 0.04), (0.28, -0.18, 1.8), 0.022, "wood")
        b.box((-0.22, 0.05, 0.85), (0.08, 0.2, 0.18), "leather")
    elif k == "explorer":
        _hair(b)
        b.cylinder((0.0, 0.0, 1.69), 0.26, 0.025, "leather", segments=16)
        b.cylinder((0.0, 0.0, 1.76), 0.135, 0.13, "leather", radius_top=0.12, segments=12)
        b.cylinder((0.0, 0.0, 1.715), 0.137, 0.03, "team", segments=12)
        _arm(b, 1.0, right, "cloth")
        _arm(b, -1.0, (-0.18, -0.3, 1.4), "cloth")
        b.between((-0.18, -0.3, 1.4), (-0.12, -0.58, 1.52), 0.03, "metal", radius_end=0.04)  # spyglass
        b.box((0.0, 0.22, 1.1), (0.34, 0.2, 0.46), "leather")
        b.cylinder((0.0, 0.22, 1.38), 0.08, 0.42, "cloth", rotation=(0.0, math.pi / 2, 0.0), segments=8)
    obj = b.to_object(spec.asset_id, spec.materials)
    finish(obj)
    return [obj]
