"""Civolution mounted units: a low-poly horse with a seated rider, or a chariot.

Faces -Y, origin at the footprint centre, base on Z=0. The rider reuses the foot
figure's body and arms (``civ_figure``), seated on the saddle.

Slots: skin, hair, cloth, team, leather, wood, metal (as civ.figure) plus horse
(coat) and mane (mane, tail and hooves).
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass

import bpy

from blender.generators.civ_common import ShapeBuilder, finish
from blender.generators.civ_figure import arm, body, flag, hair, kite_shield
from blender.lib.spec import AssetSpec, SpecError, as_int, as_str, reject_unknown, require_key, require_materials

MATERIAL_SLOTS: tuple[str, ...] = ("skin", "hair", "cloth", "team", "leather", "wood", "metal", "horse", "mane")
KINDS = ("horseman", "knight", "cavalry", "chariot")

SADDLE_Z = 1.6


@dataclass(frozen=True)
class MountedParams:
    kind: str
    seed: int


def parse_params(raw: Mapping[str, object]) -> MountedParams:
    reject_unknown(raw, ("kind", "seed"), "params")
    kind = as_str(require_key(raw, "kind", "params"), "params.kind")
    if kind not in KINDS:
        raise SpecError(f"params.kind must be one of {KINDS}, got {kind!r}")
    return MountedParams(kind=kind, seed=as_int(require_key(raw, "seed", "params"), "params.seed"))


def horse(b: ShapeBuilder, stride: float = 1.0, plume: bool = False) -> None:
    """A walking horse, ~1.6 m at the withers, facing -Y."""
    b.sphere((0.0, 0.05, 1.22), (0.31, 0.72, 0.38), "horse", detail=2)
    b.sphere((0.0, -0.46, 1.28), (0.29, 0.34, 0.37), "horse", detail=1)
    b.sphere((0.0, 0.5, 1.28), (0.32, 0.36, 0.36), "horse", detail=1)
    # Neck and head.
    b.between((0.0, -0.56, 1.34), (0.0, -0.9, 1.98), 0.23, "horse", segments=8, radius_end=0.13)
    b.sphere((0.0, -0.92, 2.0), (0.11, 0.14, 0.12), "horse", detail=1)
    b.between((0.0, -0.95, 2.0), (0.0, -1.26, 1.72), 0.11, "horse", segments=8, radius_end=0.075)
    b.sphere((0.0, -1.27, 1.71), (0.08, 0.08, 0.075), "horse", detail=1)
    for sx in (-1.0, 1.0):
        b.between((0.06 * sx, -0.88, 2.08), (0.07 * sx, -0.84, 2.2), 0.03, "horse", segments=4, radius_end=0.005)
        b.sphere((0.08 * sx, -1.05, 1.95), 0.022, "mane", detail=1)  # eyes
    b.between((0.0, -0.5, 1.6), (0.0, -0.85, 2.14), 0.045, "mane", segments=4, radius_end=0.035)
    b.between((0.0, 0.84, 1.45), (0.0, 1.02, 0.78), 0.075, "mane", segments=6, radius_end=0.035)
    # Bridle and reins.
    b.cylinder((0.0, -1.14, 1.8), 0.1, 0.03, "leather", rotation=(0.9, 0.0, 0.0), segments=8)
    for sx in (-1.0, 1.0):
        b.between((0.09 * sx, -1.16, 1.8), (0.17 * sx, -0.3, 1.66), 0.008, "leather", segments=4)
    if plume:
        b.between((0.0, -0.9, 2.1), (0.0, -0.84, 2.36), 0.03, "team", segments=6, radius_end=0.05)
    # Legs: walking, near fore leg lifted.
    legs = (
        ((-0.15, -0.45), (-0.15, -0.66 * stride, 0.62), (-0.15, -0.6 * stride, 0.26)),
        ((0.15, -0.45), (0.15, -0.42, 0.6), (0.15, -0.38, 0.09)),
        ((-0.15, 0.5), (-0.15, 0.62, 0.66), (-0.15, 0.52, 0.09)),
        ((0.15, 0.5), (0.15, 0.4, 0.66), (0.15, 0.62 * stride, 0.09)),
    )
    for (x, y), knee, hoof in legs:
        b.between((x, y, 1.16), knee, 0.1, "horse", segments=8, radius_end=0.062)
        b.between(knee, hoof, 0.056, "horse", segments=6, radius_end=0.048)
        b.cylinder((hoof[0], hoof[1], hoof[2] - 0.035), 0.064, 0.09, "mane", segments=8)


def saddle(b: ShapeBuilder, cloth: str = "team") -> None:
    prof = [(-0.335, 1.12), (-0.335, 1.42), (-0.2, 1.62), (0.2, 1.62), (0.335, 1.42), (0.335, 1.12)]
    drape(b, [(-0.22, prof), (0.3, prof)], cloth)
    b.box((0.0, 0.04, 1.62), (0.34, 0.5, 0.08), "leather")
    b.box((0.0, 0.3, 1.68), (0.3, 0.06, 0.12), "leather")


def drape(b: ShapeBuilder, stations: list[tuple[float, list[tuple[float, float]]]], slot: str, t: float = 0.025) -> None:
    """A cloth over the horse's back: each edge of the (x, z) profile is lofted through the
    stations as its own thin convex strip, so every shell stays simple and watertight."""
    n = len(stations[0][1])
    for j in range(n - 1):
        rings = []
        for y, prof in stations:
            (x0, z0), (x1, z1) = prof[j], prof[j + 1]
            dx, dz = x1 - x0, z1 - z0
            length = math.hypot(dx, dz)
            nx, nz = dz / length * t, -dx / length * t  # one side normal
            rings.append([(x0, y, z0), (x1, y, z1), (x1 + nx, y, z1 + nz), (x0 + nx, y, z0 + nz)])
        b.loft(rings, slot)


def caparison(b: ShapeBuilder) -> None:
    """A team cloth draped over the horse, hanging to mid leg."""
    stations = []
    for y, half, top, hem in ((-0.8, 0.27, 1.48, 1.02), (-0.55, 0.345, 1.6, 0.86), (0.0, 0.365, 1.64, 0.82),
                              (0.55, 0.37, 1.66, 0.86), (0.88, 0.31, 1.58, 1.0)):
        stations.append((y, [(-half, hem), (-half, top - 0.22), (-half * 0.6, top), (half * 0.6, top), (half, top - 0.22), (half, hem)]))
    drape(b, stations, "team")


def _rider(b: ShapeBuilder, kind: str) -> None:
    with b.placed((0.0, 0.05, SADDLE_Z - 0.8)):
        body(b, kind, seated=True)
        if kind == "horseman":
            hair(b)
            b.cylinder((0.0, 0.0, 1.62), 0.13, 0.04, "team", segments=12)
            b.cylinder((0.0, 0.03, 1.38), 0.25, 0.1, "leather", radius_top=0.12, segments=10)
            hand = (0.32, 0.02, 1.78)
            arm(b, 1.0, hand, elbow=(0.42, 0.1, 1.5))
            b.between((0.33, 0.55, 1.7), (0.31, -0.95, 1.92), 0.022, "wood", segments=6)  # javelin
            b.between((0.31, -0.95, 1.92), (0.31, -1.13, 1.95), 0.035, "metal", segments=4, radius_end=0.002)
            arm(b, -1.0, (-0.2, -0.32, 1.1), elbow=(-0.3, -0.1, 1.08))
            b.cylinder((-0.36, -0.1, 1.1), 0.22, 0.04, "team", rotation=(0.0, math.pi / 2, 0.0), segments=12)
            b.sphere((-0.39, -0.1, 1.1), 0.05, "metal", detail=1)
        elif kind == "knight":
            # Great helm with a team crest, mail, lance with pennant, kite shield.
            b.cylinder((0.0, 0.0, 1.6), 0.15, 0.3, "metal", segments=12)
            b.sphere((0.0, 0.0, 1.75), (0.15, 0.15, 0.05), "metal", detail=1)
            b.box((0.0, -0.145, 1.63), (0.22, 0.02, 0.025), "hair")  # eye slit
            b.extrude([(-0.1, 1.76), (0.1, 1.76), (0.06, 1.88), (0.0, 1.95), (-0.06, 1.88)], "y", -0.02, 0.02, "team")
            for sx in (-1.0, 1.0):
                b.sphere((0.23 * sx, 0.0, 1.36), (0.1, 0.1, 0.06), "metal", detail=1)
            hand = (0.28, -0.2, 1.1)
            arm(b, 1.0, hand, sleeve="metal", elbow=(0.33, 0.05, 1.1), shoulder_slot="metal")
            b.between((0.28, 0.6, 0.98), (0.26, -2.0, 1.48), 0.035, "wood", segments=8, radius_end=0.018)
            b.cylinder((0.28, -0.32, 1.1), 0.075, 0.14, "metal", rotation=(math.pi / 2 - 0.19, 0.0, 0.0), segments=8, radius_top=0.04)
            flag(b, (0.26, -1.78, 1.47), 0.34, 0.16, "team", wave=0.03, side=-1.0)
            arm(b, -1.0, (-0.26, -0.24, 1.08), sleeve="metal", elbow=(-0.32, -0.04, 1.12), shoulder_slot="metal")
            with b.placed((-0.34, -0.22, 1.04), yaw=-0.9):
                kite_shield(b, "team", rim="metal")
        elif kind == "cavalry":
            hair(b)
            # Shako with plume, team jacket, sabre raised.
            b.cylinder((0.0, 0.0, 1.73), 0.125, 0.17, "hair", radius_top=0.145, segments=12)
            b.cylinder((0.0, 0.0, 1.72), 0.128, 0.04, "team", segments=12)
            b.cylinder((0.0, 0.0, 1.82), 0.147, 0.02, "metal", segments=12)
            b.box((0.0, -0.13, 1.67), (0.2, 0.1, 0.02), "hair", rotation=(-0.2, 0.0, 0.0))
            b.between((0.0, -0.1, 1.82), (0.0, -0.12, 2.0), 0.03, "team", segments=6, radius_end=0.045)
            b.box((0.0, -0.2, 1.13), (0.1, 0.02, 0.44), "metal")  # frogging
            for z in (1.0, 1.1, 1.2):
                b.box((0.0, -0.205, z), (0.2, 0.02, 0.025), "cloth")
            hand = (0.3, -0.12, 1.66)
            arm(b, 1.0, hand, sleeve="team", elbow=(0.42, 0.02, 1.42))
            b.box((0.3, -0.12, 1.72), (0.12, 0.04, 0.03), "metal")
            b.between((0.3, -0.12, 1.73), (0.28, -0.35, 2.48), 0.03, "metal", segments=4, radius_end=0.01)
            arm(b, -1.0, (-0.14, -0.36, 1.05), sleeve="team", elbow=(-0.3, -0.14, 1.06))
            b.between((-0.28, -0.05, 0.92), (-0.36, 0.55, 0.6), 0.03, "metal", segments=6)  # scabbard
            b.between((0.27, 0.1, 0.95), (0.3, 0.55, 0.62), 0.04, "wood", segments=6)  # carbine
        else:
            raise SpecError(f"no rider for {kind!r}")


def _spoked_wheel(b: ShapeBuilder, center: tuple[float, float, float], radius: float) -> None:
    b.spoked_wheel(center, radius, 0.08, "wood", "wood", "metal", spokes=4, segments=12)


def _chariot(b: ShapeBuilder) -> None:
    for sx in (-1.0, 1.0):
        with b.placed((0.38 * sx, -0.7, 0.0), scale=0.92):
            horse(b, stride=1.0 if sx < 0 else 0.6, plume=True)
    # Yoke and pole.
    b.between((-0.5, -1.18, 1.5), (0.5, -1.18, 1.5), 0.04, "wood", segments=6)
    b.between((0.0, -1.18, 1.48), (0.0, 0.85, 0.72), 0.045, "wood", segments=6)
    # Car: floor, team side screens, open back, two big wheels.
    cy = 1.12
    b.box((0.0, cy, 0.68), (0.9, 0.62, 0.06), "wood")
    b.extrude([(-0.45, 0.7), (0.45, 0.7), (0.45, 1.18), (0.3, 1.25), (-0.3, 1.25), (-0.45, 1.18)], "y", cy - 0.34, cy - 0.28, "team")
    for sx in (-1.0, 1.0):
        b.extrude([(cy - 0.31, 0.7), (cy + 0.3, 0.7), (cy + 0.3, 0.92), (cy - 0.31, 1.18)], "x", 0.43 * sx - 0.03, 0.43 * sx + 0.03, "team")
        b.box((0.43 * sx, cy - 0.31, 1.22), (0.08, 0.08, 0.1), "metal")
        _spoked_wheel(b, (0.55 * sx, cy, 0.5), 0.5)
    b.between((-0.62, cy, 0.5), (0.62, cy, 0.5), 0.04, "wood", segments=6)  # axle
    # Charioteer standing in the car, reins in hand and a spear.
    with b.placed((0.0, cy + 0.05, 0.71), scale=0.95):
        body(b, "charioteer")
        hair(b)
        b.cylinder((0.0, 0.0, 1.66), 0.135, 0.12, "metal", radius_top=0.1, segments=12)
        b.between((0.0, 0.0, 1.72), (0.0, 0.08, 1.9), 0.03, "team", segments=6, radius_end=0.05)
        arm(b, -1.0, (-0.14, -0.42, 1.06), elbow=(-0.3, -0.12, 1.06))
        arm(b, 1.0, (0.28, -0.2, 1.08), elbow=(0.33, 0.0, 1.06))
        b.between((0.28, 0.4, 0.6), (0.28, -0.95, 2.1), 0.022, "wood", segments=6)
        b.between((0.28, -0.95, 2.1), (0.28, -1.06, 2.22), 0.035, "metal", segments=4, radius_end=0.002)
    for sx in (-1.0, 1.0):
        b.between((-0.133, cy - 0.35, 1.72), (0.38 * sx, -1.66, 1.66), 0.01, "leather", segments=4)


def build(spec: AssetSpec) -> list[bpy.types.Object]:
    require_materials(spec.materials, MATERIAL_SLOTS, spec.generator)
    p = parse_params(spec.params)
    b = ShapeBuilder(MATERIAL_SLOTS)
    if p.kind == "chariot":
        _chariot(b)
    else:
        horse(b, plume=p.kind == "knight")
        if p.kind == "knight":
            # Caparison: a team cloth draped over the horse, with a metal chanfron.
            caparison(b)
            b.between((0.0, -0.96, 2.04), (0.0, -1.24, 1.78), 0.09, "metal", segments=6, radius_end=0.06)
            b.box((0.0, 0.05, 1.63), (0.34, 0.5, 0.08), "leather")
        else:
            saddle(b)
        _rider(b, p.kind)
    obj = b.to_object(spec.asset_id, spec.materials)
    finish(obj)
    return [obj]
