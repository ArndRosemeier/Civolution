"""Civolution siege engines and guns: catapult, trebuchet, cannon, field artillery.

Faces -Y (the direction of fire), origin at the footprint centre, base on Z=0.
Slots: wood, dark (iron fittings), metal (bronze or gun steel), team, rope, rubber,
paint (carriage paint of modern guns), stone.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass

import bpy

from blender.generators.civ_common import ShapeBuilder, finish
from blender.generators.civ_figure import flag
from blender.lib.spec import AssetSpec, SpecError, as_int, as_str, reject_unknown, require_key, require_materials

MATERIAL_SLOTS: tuple[str, ...] = ("wood", "dark", "metal", "team", "rope", "rubber", "paint", "stone")
KINDS = ("catapult", "trebuchet", "cannon", "artillery")


@dataclass(frozen=True)
class SiegeParams:
    kind: str
    seed: int


def parse_params(raw: Mapping[str, object]) -> SiegeParams:
    reject_unknown(raw, ("kind", "seed"), "params")
    kind = as_str(require_key(raw, "kind", "params"), "params.kind")
    if kind not in KINDS:
        raise SpecError(f"params.kind must be one of {KINDS}, got {kind!r}")
    return SiegeParams(kind=kind, seed=as_int(require_key(raw, "seed", "params"), "params.seed"))


def spoked_wheel(b: ShapeBuilder, center: tuple[float, float, float], radius: float, width: float, spokes: int = 6) -> None:
    b.spoked_wheel(center, radius, width, "wood", "wood", "dark", spokes=spokes, segments=14)


def _catapult(b: ShapeBuilder) -> None:
    # Low wheeled frame.
    for sx in (-1.0, 1.0):
        b.box((0.5 * sx, 0.0, 0.5), (0.16, 3.0, 0.2), "wood")
        b.box((0.5 * sx, -1.2, 0.5), (0.2, 0.2, 0.22), "dark")
        for y in (-1.0, 1.0):
            b.wheel((0.66 * sx, y, 0.36), 0.36, 0.14, "wood", segments=12)
            b.wheel((0.66 * sx, y, 0.36), 0.12, 0.2, "dark", segments=8)
    for y in (-1.3, -0.25, 0.9, 1.4):
        b.box((0.0, y, 0.5), (1.16, 0.16, 0.16), "wood")
    for y in (-1.0, 1.0):
        b.between((-0.75, y, 0.36), (0.75, y, 0.36), 0.05, "dark", segments=6)
    # Upright frame with a padded stop beam in team colour.
    for sx in (-1.0, 1.0):
        b.between((0.5 * sx, -0.25, 0.5), (0.42 * sx, -0.45, 1.75), 0.08, "wood", segments=6)
        b.between((0.5 * sx, 0.9, 0.5), (0.42 * sx, -0.4, 1.68), 0.065, "wood", segments=6)
    b.box((0.0, -0.45, 1.75), (1.0, 0.18, 0.18), "wood")
    b.box((0.0, -0.37, 1.75), (0.5, 0.12, 0.3), "team")
    # Torsion skein and the throwing arm, cocked back with a stone in the cup.
    b.wheel((0.0, 0.9, 0.62), 0.16, 0.9, "rope", segments=10)
    for sx in (-1.0, 1.0):
        b.wheel((0.42 * sx, 0.9, 0.62), 0.2, 0.08, "dark", segments=10)
    b.between((0.0, 0.9, 0.62), (0.0, -0.75, 1.15), 0.075, "wood", segments=6, radius_end=0.06)
    b.cylinder((0.0, -0.82, 1.24), 0.24, 0.16, "wood", segments=10, radius_top=0.28)
    b.sphere((0.0, -0.82, 1.38), 0.17, "stone", detail=1)
    # Winch at the back and a team pennant.
    b.wheel((0.0, 1.35, 0.68), 0.09, 1.1, "wood", segments=8)
    for sx in (-1.0, 1.0):
        b.box((0.62 * sx, 1.35, 0.68), (0.04, 0.5, 0.06), "wood")
    b.between((-0.5, 1.4, 0.6), (-0.5, 1.4, 2.3), 0.03, "wood", segments=6)
    flag(b, (-0.5, 1.4, 2.28), 0.5, 0.36, "team", wave=0.05)


def _trebuchet(b: ShapeBuilder) -> None:
    # Base: two long sills and cross pieces.
    for sx in (-1.0, 1.0):
        b.box((0.7 * sx, 0.0, 0.12), (0.22, 3.6, 0.24), "wood")
    for y in (-1.6, -0.6, 0.6, 1.6):
        b.box((0.0, y, 0.3), (1.62, 0.2, 0.2), "wood")
    # Two A-frame towers carrying the axle.
    top = 3.0
    for sx in (-1.0, 1.0):
        x = 0.62 * sx
        b.between((x, -1.5, 0.24), (x, 0.0, top), 0.1, "wood", segments=6)
        b.between((x, 1.5, 0.24), (x, 0.0, top), 0.1, "wood", segments=6)
        b.between((x, 0.0, 0.24), (x, 0.0, top), 0.09, "wood", segments=6)
        b.box((x, 0.0, 1.4), (0.14, 1.9, 0.14), "wood")
        b.box((x, 0.0, top), (0.24, 0.3, 0.3), "dark")
    b.wheel((0.0, 0.0, top), 0.07, 1.5, "dark", segments=8)
    # Arm cocked: counterweight raised at the front, long end down at the back.
    pivot = (0.0, 0.0, top)
    short_end = (0.0, -1.05, top + 0.85)
    long_end = (0.0, 3.0, 0.5)
    b.between(short_end, long_end, 0.11, "wood", segments=8, radius_end=0.07)
    b.box((0.0, -0.18, top + 0.15), (0.26, 0.3, 0.3), "dark")
    # Hinged counterweight box (team) hanging under the short end.
    b.between(short_end, (0.0, -1.05, top + 0.25), 0.04, "dark", segments=6)
    b.box((0.0, -1.05, top - 0.15), (0.95, 0.9, 0.85), "team")
    for z in (top - 0.5, top + 0.2):
        b.box((0.0, -1.05, z), (1.0, 0.95, 0.08), "dark")
    # Sling and stone lying in the trough.
    b.between(long_end, (0.0, 2.2, 0.32), 0.015, "rope", segments=4)
    b.box((0.0, 1.6, 0.42), (0.3, 2.0, 0.06), "wood")
    b.sphere((0.0, 2.1, 0.6), 0.2, "stone", detail=1)
    # Winch wheels and a pennant on top.
    for sx in (-1.0, 1.0):
        b.wheel((0.88 * sx, 1.2, 0.85), 0.45, 0.08, "wood", segments=12)
        b.wheel((0.88 * sx, 1.2, 0.85), 0.08, 0.2, "dark", segments=8)
    b.between((0.62, 0.0, top + 0.15), (0.62, 0.0, top + 1.25), 0.03, "wood", segments=6)
    flag(b, (0.62, 0.0, top + 1.22), 0.6, 0.4, "team", wave=0.06)


def _cannon(b: ShapeBuilder) -> None:
    axle_z = 0.72
    for sx in (-1.0, 1.0):
        spoked_wheel(b, (0.62 * sx, 0.0, axle_z), 0.72, 0.1, spokes=7)
        # Carriage cheeks in team colour, sloping down to the trail.
        b.box((0.15 * sx, 0.0, axle_z + 0.14), (0.1, 0.75, 0.42), "team")
        b.between((0.15 * sx, 0.2, axle_z + 0.08), (0.06 * sx, 1.95, 0.1), 0.13, "team", segments=4)
    b.between((-0.7, 0.0, axle_z), (0.7, 0.0, axle_z), 0.06, "dark", segments=8)
    b.box((0.0, 1.85, 0.08), (0.4, 0.3, 0.12), "dark")
    b.box((0.0, 1.0, 0.5), (0.3, 0.12, 0.12), "wood")
    b.box((0.0, 2.05, 0.22), (0.08, 0.25, 0.06), "dark")  # trail handle
    # Bronze barrel with reinforcing rings, muzzle swell and cascabel.
    breech = (0.0, 0.42, axle_z + 0.42)
    muzzle = (0.0, -1.55, axle_z + 0.32)
    b.between(breech, muzzle, 0.17, "metal", segments=12, radius_end=0.11)
    b.sphere((0.0, 0.46, axle_z + 0.42), 0.17, "metal", detail=1)
    b.sphere((0.0, 0.66, axle_z + 0.43), 0.06, "metal", detail=1)
    for t, r in ((0.12, 0.185), (0.4, 0.16), (0.98, 0.135)):
        p = tuple(breech[i] + (muzzle[i] - breech[i]) * t for i in range(3))
        b.cylinder(p, r, 0.06, "metal", rotation=(math.pi / 2 - 0.05, 0.0, 0.0), segments=12)
    b.wheel((0.0, -0.05, axle_z + 0.38), 0.05, 0.42, "metal", segments=8)  # trunnions
    # Shot and rammer beside the trail.
    for i, (x, y) in enumerate(((0.55, 1.2), (0.7, 1.3), (0.62, 1.42))):
        b.sphere((x, y, 0.1 + (0.12 if i == 2 else 0.0)), 0.1, "dark", detail=1)
    b.between((-0.5, 0.6, 0.06), (-0.5, 2.0, 0.06), 0.03, "wood", segments=6)
    b.cylinder((-0.5, 0.55, 0.07), 0.07, 0.14, "rope", rotation=(math.pi / 2, 0.0, 0.0), segments=8)


def _artillery(b: ShapeBuilder) -> None:
    axle_z = 0.55
    # Rubber-tyred wheels and the axle.
    for sx in (-1.0, 1.0):
        b.wheel((0.82 * sx, 0.0, axle_z), 0.55, 0.26, "rubber", segments=16)
        b.wheel((0.82 * sx, 0.0, axle_z), 0.34, 0.28, "paint", segments=12)
        b.wheel((0.82 * sx, 0.0, axle_z), 0.1, 0.32, "dark", segments=8)
    b.box((0.0, 0.0, axle_z), (1.5, 0.3, 0.24), "paint")
    # Split trail, spread out behind, with spades.
    for sx in (-1.0, 1.0):
        b.between((0.2 * sx, 0.1, axle_z), (0.95 * sx, 2.6, 0.12), 0.09, "paint", segments=6, radius_end=0.07)
        b.box((0.97 * sx, 2.7, 0.15), (0.3, 0.06, 0.3), "dark", rotation=(0.0, 0.0, -0.35 * sx))
    # Cradle, recoil cylinders and long barrel with a muzzle brake.
    b.box((0.0, 0.0, axle_z + 0.4), (0.5, 1.2, 0.36), "paint")
    b.box((0.0, 0.55, axle_z + 0.42), (0.36, 0.4, 0.3), "dark")  # breech block
    pitch = 0.18
    def along(d: float, dz: float = 0.0) -> tuple[float, float, float]:
        return (0.0, -d * math.cos(pitch), axle_z + 0.45 + d * math.sin(pitch) + dz)
    b.between(along(-0.3), along(3.0), 0.1, "dark", segments=10, radius_end=0.08)
    b.between(along(-0.2, -0.16), along(1.3, -0.16), 0.08, "paint", segments=8)
    b.between(along(2.95), along(3.3), 0.13, "dark", segments=8)
    # Gun shield in team colour, two plates angled back.
    for sx in (-1.0, 1.0):
        with b.placed((0.38 * sx, -0.45, axle_z + 0.55), yaw=0.25 * sx):
            b.extrude([(-0.38, -0.25), (0.38, -0.25), (0.38, 0.6), (0.2, 0.75), (-0.38, 0.75)] if sx > 0 else
                      [(-0.38, -0.25), (0.38, -0.25), (0.38, 0.75), (-0.2, 0.75), (-0.38, 0.6)], "y", -0.03, 0.03, "team")
    b.box((0.0, -0.48, axle_z + 0.15), (0.32, 0.06, 0.4), "team")
    # Ammunition crates.
    for i, (x, y) in enumerate(((-0.25, 1.6), (0.25, 1.65))):
        b.box((x, y, 0.15), (0.4, 0.6, 0.3), "wood", rotation=(0.0, 0.0, 0.1 * (i - 0.5)))


def build(spec: AssetSpec) -> list[bpy.types.Object]:
    require_materials(spec.materials, MATERIAL_SLOTS, spec.generator)
    p = parse_params(spec.params)
    b = ShapeBuilder(MATERIAL_SLOTS)
    {"catapult": _catapult, "trebuchet": _trebuchet, "cannon": _cannon, "artillery": _artillery}[p.kind](b)
    obj = b.to_object(spec.asset_id, spec.materials)
    finish(obj)
    return [obj]
