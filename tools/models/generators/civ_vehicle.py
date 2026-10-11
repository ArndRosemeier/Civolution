"""Civolution armoured vehicles: tank, modern armour, mechanised infantry, mobile SAM.

Faces -Y (gun and glacis forward), origin at the footprint centre, base on Z=0.
Slots: body (hull paint), dark (running gear, gun steel), track, team (turret or
launcher, tinted per civilization), metal (bare steel details), glass (vision
blocks, lights), light (missiles, markings).
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass

import bpy

from blender.generators.civ_common import ShapeBuilder, finish
from blender.lib.spec import AssetSpec, SpecError, as_int, as_str, reject_unknown, require_key, require_materials

MATERIAL_SLOTS: tuple[str, ...] = ("body", "dark", "track", "team", "metal", "glass", "light")
KINDS = ("tank", "modern_armor", "mech_infantry", "mobile_sam")


@dataclass(frozen=True)
class VehicleParams:
    kind: str
    seed: int


def parse_params(raw: Mapping[str, object]) -> VehicleParams:
    reject_unknown(raw, ("kind", "seed"), "params")
    kind = as_str(require_key(raw, "kind", "params"), "params.kind")
    if kind not in KINDS:
        raise SpecError(f"params.kind must be one of {KINDS}, got {kind!r}")
    return VehicleParams(kind=kind, seed=as_int(require_key(raw, "seed", "params"), "params.seed"))


def tracks(b: ShapeBuilder, half_gauge: float, length: float, width: float, height: float, wheels: int, wheel_r: float) -> None:
    """Two track runs: a stadium loop each, road wheels on the outside, drive sprocket and idler."""
    r = height * 0.5
    run = length - 2.0 * r
    for sx in (-1.0, 1.0):
        x = half_gauge * sx
        b.box((x, 0.0, r), (width, run, height), "track")
        for sy in (-1.0, 1.0):
            b.wheel((x, sy * run * 0.5, r), r, width, "track", segments=10)
        for i in range(wheels):
            y = -run * 0.5 + run * i / max(1, wheels - 1)
            b.wheel((x + sx * width * 0.08, y, wheel_r + 0.06), wheel_r, width * 0.9, "dark", segments=10)
            b.wheel((x + sx * width * 0.5, y, wheel_r + 0.06), wheel_r * 0.32, 0.06, "metal", segments=6)
        for sy in (-1.0, 1.0):
            b.wheel((x + sx * width * 0.5, sy * run * 0.5, r), r * 0.4, 0.07, "metal", segments=8)


def _tank(b: ShapeBuilder) -> None:
    tracks(b, 1.15, 5.6, 0.6, 1.0, 5, 0.32)
    b.box((0.0, 0.0, 0.7), (1.7, 5.0, 0.7), "body")
    # Upper hull with sloped glacis; fenders over the tracks.
    b.extrude([(-2.95, 0.95), (-2.15, 1.7), (2.45, 1.7), (2.85, 1.35), (2.85, 0.95)], "x", -1.48, 1.48, "body")
    b.box((0.0, 2.75, 1.15), (1.4, 0.2, 0.35), "dark")  # rear plate
    for sx in (-1.0, 1.0):
        b.wheel((0.85 * sx, 2.92, 1.15), 0.14, 0.16, "dark", segments=8)  # exhausts end-on
        b.box((0.9 * sx, -2.45, 1.38), (0.14, 0.08, 0.1), "glass", rotation=(0.8, 0.0, 0.0))  # headlights
    b.box((-0.6, -2.3, 1.42), (0.16, 0.1, 0.1), "dark", rotation=(0.8, 0.0, 0.0))  # hull MG
    # Cast turret in team colour, mantlet and gun.
    b.cylinder((0.0, 0.25, 2.05), 1.05, 0.7, "team", segments=12, radius_top=0.85)
    b.cylinder((0.0, 0.25, 1.73), 1.02, 0.06, "dark", segments=12)
    b.box((0.0, 1.15, 2.0), (1.3, 0.5, 0.55), "team")  # bustle
    b.box((0.0, -0.82, 2.0), (0.7, 0.3, 0.5), "dark")
    b.between((0.0, -0.9, 2.02), (0.0, -3.9, 2.06), 0.095, "dark", segments=8)
    b.between((0.0, -3.75, 2.06), (0.0, -4.0, 2.06), 0.12, "dark", segments=8)
    b.cylinder((0.35, 0.45, 2.45), 0.3, 0.12, "team", segments=10)  # cupola
    b.sphere((0.35, 0.45, 2.52), (0.26, 0.26, 0.1), "dark", detail=1)
    b.between((-0.35, 0.3, 2.5), (-0.35, -0.4, 2.62), 0.03, "dark", segments=6)  # AA MG
    b.box((-0.35, 0.4, 2.5), (0.08, 0.2, 0.2), "dark")
    b.box((0.0, 1.5, 1.82), (0.9, 0.5, 0.18), "metal")  # stowage
    b.between((-0.5, 1.6, 2.35), (-0.5, 1.6, 3.4), 0.015, "metal", segments=4)  # antenna


def _modern_armor(b: ShapeBuilder) -> None:
    tracks(b, 1.35, 7.0, 0.7, 0.95, 7, 0.32)
    b.box((0.0, 0.0, 0.75), (2.0, 6.6, 0.75), "body")
    # Low hull with a sharp glacis and side skirts.
    b.extrude([(-3.75, 1.0), (-3.2, 1.6), (3.3, 1.6), (3.5, 1.15), (3.5, 0.95)], "x", -1.2, 1.2, "body")
    for sx in (-1.0, 1.0):
        b.extrude([(-3.55, 0.55), (-3.3, 1.3), (3.3, 1.3), (3.4, 0.55)], "x", 1.62 * sx - 0.05, 1.62 * sx + 0.05, "body")
        b.box((1.62 * sx, -0.3, 1.36), (0.2, 6.6, 0.12), "body")
        b.box((1.0 * sx, -3.25, 1.5), (0.18, 0.08, 0.12), "glass", rotation=(0.6, 0.0, 0.0))
    b.box((0.0, -3.2, 1.62), (0.6, 0.3, 0.06), "glass")  # driver's vision blocks
    # Wide faceted turret (team) with a long bustle.
    b.extrude([(-0.75, -1.9), (0.75, -1.9), (1.75, -0.9), (1.75, 1.3), (1.45, 2.3), (-1.45, 2.3), (-1.75, 1.3), (-1.75, -0.9)], "z", 1.6, 2.35, "team")
    b.extrude([(-0.6, -1.75), (0.6, -1.75), (1.55, -0.85), (1.55, 1.2), (1.3, 2.15), (-1.3, 2.15), (-1.55, 1.2), (-1.55, -0.85)], "z", 2.35, 2.45, "team")
    b.box((0.0, 2.6, 2.0), (2.6, 0.5, 0.6), "metal")  # bustle rack
    b.box((0.0, -1.95, 1.98), (0.55, 0.3, 0.5), "dark")  # mantlet
    b.between((0.0, -2.0, 2.0), (0.0, -6.0, 2.06), 0.1, "dark", segments=8)
    b.between((0.0, -3.6, 2.03), (0.0, -4.1, 2.04), 0.14, "dark", segments=8)  # fume extractor
    b.box((0.8, -0.9, 2.62), (0.5, 0.4, 0.34), "dark")  # gunner's sight
    b.box((0.8, -1.1, 2.62), (0.38, 0.03, 0.22), "glass")
    b.cylinder((-0.65, 0.2, 2.56), 0.36, 0.22, "team", segments=10)  # commander's cupola
    b.between((-0.65, 0.0, 2.75), (-0.65, -0.8, 2.8), 0.035, "dark", segments=6)
    for sx in (-1.0, 1.0):
        b.box((1.25 * sx, -1.45, 2.4), (0.25, 0.25, 0.22), "dark")  # smoke dischargers
        b.between((1.2 * sx, 1.9, 2.45), (1.2 * sx, 1.9, 3.6), 0.015, "metal", segments=4)


def _mech_infantry(b: ShapeBuilder) -> None:
    tracks(b, 1.25, 6.2, 0.6, 0.95, 6, 0.32)
    # Tall boxy hull with a sloped nose and a rear ramp.
    b.extrude([(-3.25, 0.6), (-3.05, 1.35), (-2.2, 2.15), (3.05, 2.15), (3.15, 0.6)], "x", -1.6, 1.6, "body")
    for sx in (-1.0, 1.0):
        b.box((1.66 * sx, 0.4, 1.4), (0.08, 4.8, 0.7), "body")  # spaced armour
        for i in range(3):
            b.box((1.71 * sx, -1.2 + i * 1.4, 1.65), (0.04, 0.5, 0.12), "glass")  # firing ports
    b.box((0.0, 3.12, 1.35), (2.0, 0.12, 1.3), "dark")  # ramp
    b.box((-0.9, -2.55, 2.0), (0.6, 0.6, 0.1), "glass", rotation=(0.65, 0.0, 0.0))  # driver's hatch blocks
    # Turret off-set right, in team colour, with autocannon and missile pod.
    b.extrude([(-0.65, -0.9), (0.7, -0.9), (1.05, -0.4), (1.05, 0.9), (-0.85, 0.9), (-0.85, -0.4)], "z", 2.15, 2.75, "team")
    b.box((0.1, -0.5, 2.82), (1.4, 0.8, 0.14), "team")
    b.between((0.05, -0.95, 2.45), (0.05, -3.75, 2.48), 0.06, "dark", segments=8)
    b.between((0.05, -3.5, 2.48), (0.05, -3.8, 2.48), 0.08, "dark", segments=8)
    b.box((-1.1, 0.05, 2.55), (0.45, 1.2, 0.4), "dark")  # missile launcher box
    for i in range(2):
        b.box((-1.1, -0.56, 2.46 + 0.17 * i), (0.32, 0.03, 0.12), "light")
    b.box((0.7, 0.3, 2.93), (0.3, 0.3, 0.2), "dark")
    b.between((-0.5, 0.6, 2.75), (-0.5, 0.6, 3.8), 0.015, "metal", segments=4)


def _mobile_sam(b: ShapeBuilder) -> None:
    tracks(b, 1.2, 5.6, 0.6, 0.95, 5, 0.32)
    b.extrude([(-2.95, 0.6), (-2.6, 1.55), (2.85, 1.55), (2.95, 0.6)], "x", -1.5, 1.5, "body")
    # Armoured cab at the front.
    b.extrude([(-2.6, 1.55), (-2.1, 2.55), (-0.8, 2.55), (-0.8, 1.55)], "x", -1.3, 1.3, "body")
    b.box((0.0, -2.36, 2.1), (2.2, 0.06, 0.5), "glass", rotation=(-0.46, 0.0, 0.0))
    b.box((0.0, -1.45, 2.6), (2.4, 1.1, 0.1), "team")
    # Turntable, launcher frame (team) and four ready missiles angled up.
    b.cylinder((0.0, 1.0, 1.75), 1.0, 0.4, "dark", segments=12)
    b.box((0.0, 1.0, 2.3), (1.0, 1.2, 0.8), "team")
    b.box((0.0, 0.95, 2.95), (0.5, 0.5, 0.5), "glass")  # sensor head
    elev = 0.5
    def missile(x: float, z: float) -> None:
        ca, sa = math.cos(elev), math.sin(elev)
        tail = (x, 2.2, z)
        nose = (x, 2.2 - 3.0 * ca, z + 3.0 * sa)
        b.between(tail, nose, 0.13, "light", segments=8)
        b.between(nose, (x, nose[1] - 0.45 * ca, nose[2] + 0.45 * sa), 0.13, "light", segments=8, radius_end=0.01)
        for k in range(2):
            fin = (x, 2.2 - 0.3 * ca, z + 0.3 * sa)
            b.box(fin, (0.48 if k == 0 else 0.03, 0.3, 0.03 if k == 0 else 0.48), "team", rotation=(-elev, 0.0, 0.0))
    for sx in (-1.0, 1.0):
        b.box((0.95 * sx, 2.2 - 1.5 * math.cos(elev), 2.875 + 1.5 * math.sin(elev)), (0.16, 2.8, 0.22), "team", rotation=(-elev, 0.0, 0.0))
        for dz in (0.0, 0.45):
            missile(0.95 * sx, 2.65 + dz)
    for sx in (-1.0, 1.0):
        b.between((0.0, 1.0, 2.45), (0.95 * sx, 1.0, 3.5), 0.08, "dark", segments=6)
    b.between((1.2, 2.5, 1.55), (1.2, 2.5, 3.0), 0.015, "metal", segments=4)


def build(spec: AssetSpec) -> list[bpy.types.Object]:
    require_materials(spec.materials, MATERIAL_SLOTS, spec.generator)
    p = parse_params(spec.params)
    b = ShapeBuilder(MATERIAL_SLOTS)
    {"tank": _tank, "modern_armor": _modern_armor, "mech_infantry": _mech_infantry, "mobile_sam": _mobile_sam}[p.kind](b)
    obj = b.to_object(spec.asset_id, spec.materials)
    finish(obj)
    return [obj]
