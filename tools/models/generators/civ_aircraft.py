"""Civolution aircraft and missiles.

Aircraft are modelled in flight (no undercarriage), nose towards -Y, origin at the
footprint centre with the lowest point on Z=0. The nuclear missile stands upright
on its launch pad. Slots: body (airframe paint), dark (engines, props, details),
team (wing tips, fins, markings), glass (canopies), metal (bare metal), light
(missile bodies, deck markings).
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import bpy

from blender.generators.civ_common import ShapeBuilder, finish
from blender.lib.spec import AssetSpec, SpecError, as_int, as_str, reject_unknown, require_key, require_materials

MATERIAL_SLOTS: tuple[str, ...] = ("body", "dark", "team", "glass", "metal", "light")
KINDS = ("fighter", "jet_fighter", "bomber", "stealth_bomber", "helicopter", "cruise_missile", "nuclear_missile")


@dataclass(frozen=True)
class AircraftParams:
    kind: str
    seed: int


def parse_params(raw: Mapping[str, object]) -> AircraftParams:
    reject_unknown(raw, ("kind", "seed"), "params")
    kind = as_str(require_key(raw, "kind", "params"), "params.kind")
    if kind not in KINDS:
        raise SpecError(f"params.kind must be one of {KINDS}, got {kind!r}")
    return AircraftParams(kind=kind, seed=as_int(require_key(raw, "seed", "params"), "params.seed"))


def fuselage(b: ShapeBuilder, stations: Sequence[tuple[float, float, float, float]], slot: str = "body", sides: int = 8) -> None:
    """Loft of elliptical rings: (y, half width, half height, centre z) from nose to tail."""
    rings = []
    for y, rx, rz, zc in stations:
        rings.append([(max(rx, 0.01) * math.cos(a), y, zc + max(rz, 0.01) * math.sin(a)) for a in (k * 2 * math.pi / sides + math.pi / sides for k in range(sides))])
    b.loft(rings, slot)


def plate(b: ShapeBuilder, outline: Sequence[tuple[float, float]], z: float, t: float, slot: str) -> None:
    """A flat horizontal surface (wing, stabiliser) from a convex top-view outline."""
    b.extrude(outline, "z", z - t * 0.5, z + t * 0.5, slot)


def fin(b: ShapeBuilder, outline: Sequence[tuple[float, float]], x: float, t: float, slot: str) -> None:
    """A vertical surface from a convex side-view (y, z) outline."""
    b.extrude(outline, "x", x - t * 0.5, x + t * 0.5, slot)



def propeller(b: ShapeBuilder, center: tuple[float, float, float], radius: float, blades: int = 3, spinner: str = "team") -> None:
    x, y, z = center
    b.sphere((x, y, z), (radius * 0.18, radius * 0.3, radius * 0.18), spinner, detail=1)
    for k in range(blades):
        a = k * 2 * math.pi / blades + 0.3
        bx, bz = math.cos(a) * radius * 0.55, math.sin(a) * radius * 0.55
        b.box((x + bx, y + 0.05, z + bz), (radius * 0.9, 0.04, radius * 0.14), "dark", rotation=(0.0, -a, 0.0))


def _fighter(b: ShapeBuilder) -> None:
    z = 1.0
    fuselage(b, [(-4.3, 0.5, 0.52, z), (-3.6, 0.58, 0.62, z), (-1.6, 0.6, 0.68, z + 0.05), (0.5, 0.48, 0.58, z + 0.1),
                 (2.6, 0.28, 0.4, z + 0.2), (4.3, 0.1, 0.18, z + 0.35)])
    b.cylinder((0.0, -4.25, z), 0.56, 0.3, "dark", rotation=(math.pi / 2, 0.0, 0.0), segments=8)
    propeller(b, (0.0, -4.55, z), 1.5)
    b.sphere((0.0, -0.9, z + 0.6), (0.34, 0.9, 0.4), "glass", detail=1)
    wing = [(-5.6, -0.85), (-5.0, -1.3), (0.0, -1.85), (5.0, -1.3), (5.6, -0.85), (5.4, -0.25), (0.0, 0.35), (-5.4, -0.25)]
    plate(b, wing, z - 0.35, 0.18, "body")
    for sx in (-1.0, 1.0):
        tip = [(4.3 * sx, -1.42), (5.0 * sx, -1.3), (5.6 * sx, -0.85), (5.4 * sx, -0.25), (4.3 * sx, -0.12)]
        plate(b, tip, z - 0.35, 0.22, "team")
        b.between((1.8 * sx, -1.5, z - 0.35), (1.8 * sx, -2.2, z - 0.33), 0.03, "dark", segments=4)  # guns
    plate(b, [(-2.0, 3.9), (-1.8, 3.4), (1.8, 3.4), (2.0, 3.9), (1.6, 4.3), (-1.6, 4.3)], z + 0.33, 0.1, "body")
    fin(b, [(3.0, z + 0.3), (4.3, z + 0.3), (4.4, z + 1.95), (3.9, z + 1.95)], 0.0, 0.1, "team")
    b.box((0.0, 0.8, z - 0.5), (0.4, 1.2, 0.2), "dark")  # radiator scoop


def _jet_fighter(b: ShapeBuilder) -> None:
    z = 0.9
    fuselage(b, [(-6.4, 0.02, 0.02, z + 0.1), (-5.6, 0.32, 0.3, z + 0.1), (-4.0, 0.6, 0.55, z + 0.15), (-1.0, 1.2, 0.55, z),
                 (3.0, 1.2, 0.5, z), (5.0, 0.95, 0.42, z)])
    b.sphere((0.0, -3.2, z + 0.6), (0.42, 1.4, 0.42), "glass", detail=1)
    for sx in (-1.0, 1.0):
        b.box((0.9 * sx, -2.0, z - 0.2), (0.7, 1.4, 0.8), "body")  # intakes
        b.box((0.9 * sx, -2.72, z - 0.2), (0.6, 0.06, 0.66), "dark")
        b.cylinder((0.5 * sx, 5.25, z), 0.42, 0.6, "dark", rotation=(math.pi / 2, 0.0, 0.0), segments=8, radius_top=0.36)
        wing = [(1.0 * sx, -1.6), (4.4 * sx, 1.6), (4.4 * sx, 2.5), (1.0 * sx, 2.9)]
        plate(b, wing, z - 0.05, 0.14, "body")
        tip = [(3.7 * sx, 0.95), (4.4 * sx, 1.6), (4.4 * sx, 2.5), (3.7 * sx, 2.6)]
        plate(b, tip, z - 0.05, 0.18, "team")
        stab = [(1.0 * sx, 3.3), (2.9 * sx, 4.6), (2.9 * sx, 5.3), (1.0 * sx, 5.3)]
        plate(b, stab, z - 0.05, 0.1, "body")
        with b.placed((0.75 * sx, 0.0, z + 0.35)):
            b.extrude([(2.9, 0.0), (4.6, 0.0), (5.2, 2.1), (4.4, 2.1)], "x", -0.06, 0.06, "team")
    b.box((0.0, 1.2, z + 0.42), (1.4, 3.6, 0.2), "body")  # spine


def _bomber(b: ShapeBuilder) -> None:
    z = 1.3
    fuselage(b, [(-7.0, 0.3, 0.35, z + 0.05), (-6.4, 0.75, 0.8, z + 0.05), (-3.0, 0.95, 1.05, z + 0.1), (2.0, 0.9, 1.0, z + 0.15),
                 (5.0, 0.55, 0.7, z + 0.35), (7.2, 0.18, 0.3, z + 0.7)], sides=10)
    b.sphere((0.0, -6.7, z + 0.05), (0.42, 0.6, 0.45), "glass", detail=1)
    b.sphere((0.0, -4.8, z + 0.95), (0.55, 0.9, 0.38), "glass", detail=1)
    b.sphere((0.0, -2.6, z + 1.05), 0.42, "dark", detail=1)  # top turret
    b.sphere((0.0, 0.4, z - 0.98), 0.42, "dark", detail=1)  # ball turret
    wing = [(-10.0, -1.4), (-9.6, -1.9), (0.0, -3.4), (9.6, -1.9), (10.0, -1.4), (9.7, -0.6), (0.0, 0.6), (-9.7, -0.6)]
    plate(b, wing, z - 0.1, 0.32, "body")
    for sx in (-1.0, 1.0):
        tip = [(8.0 * sx, -2.2), (9.6 * sx, -1.9), (10.0 * sx, -1.4), (9.7 * sx, -0.6), (8.0 * sx, -0.4)]
        plate(b, tip, z - 0.1, 0.36, "team")
        for ex in (2.6, 5.4):
            x = ex * sx
            yl = -3.4 + 1.5 * ex / 9.6
            b.between((x, yl - 1.0, z - 0.05), (x, yl + 1.6, z - 0.05), 0.42, "body", segments=8, radius_end=0.25)
            b.cylinder((x, yl - 1.05, z - 0.05), 0.46, 0.25, "dark", rotation=(math.pi / 2, 0.0, 0.0), segments=8)
            propeller(b, (x, yl - 1.3, z - 0.05), 1.3, blades=3, spinner="dark")
    plate(b, [(-3.8, 5.6), (-3.4, 4.9), (3.4, 4.9), (3.8, 5.6), (3.2, 6.6), (-3.2, 6.6)], z + 0.55, 0.14, "body")
    fin(b, [(3.0, z + 0.6), (7.2, z + 0.6), (7.4, z + 3.2), (5.8, z + 3.2)], 0.0, 0.14, "team")


def _stealth_bomber(b: ShapeBuilder) -> None:
    z = 0.35
    for sx in (-1.0, 1.0):
        outer = [(0.0, -3.4), (8.0 * sx, 1.6), (8.0 * sx, 2.0), (5.3 * sx, 3.4), (2.6 * sx, 1.9)]
        inner = [(0.0, -3.4), (2.6 * sx, 1.9), (0.0, 3.4)]
        plate(b, outer, z, 0.22, "body")
        plate(b, inner, z + 0.05, 0.36, "body")
        tip = [(6.6 * sx, 0.73), (8.0 * sx, 1.6), (8.0 * sx, 2.0), (6.6 * sx, 2.73)]
        plate(b, tip, z, 0.26, "team")
        b.box((1.3 * sx, -0.4, z + 0.42), (0.7, 1.2, 0.2), "dark", rotation=(0.15, 0.0, 0.0))  # intakes
    # Raised centre body with a team stripe and cockpit windows.
    fuselage(b, [(-3.3, 0.12, 0.08, z + 0.08), (-2.4, 0.9, 0.36, z + 0.2), (-0.6, 1.5, 0.55, z + 0.2), (1.6, 1.4, 0.45, z + 0.15),
                 (3.0, 0.5, 0.18, z + 0.1)], slot="body", sides=8)
    b.box((0.0, -1.95, z + 0.58), (0.9, 0.5, 0.06), "glass", rotation=(-0.4, 0.0, 0.0))
    b.box((0.0, 0.4, z + 0.66), (0.5, 2.4, 0.08), "team")


def _helicopter(b: ShapeBuilder) -> None:
    b.sphere((0.0, -0.6, 1.45), (1.05, 2.2, 1.05), "body", detail=2)
    b.sphere((0.0, -2.1, 1.35), (0.82, 0.95, 0.8), "glass", detail=1)
    b.box((0.0, -0.2, 2.55), (1.1, 2.0, 0.55), "team")  # engine housing
    for sx in (-1.0, 1.0):
        b.cylinder((0.62 * sx, 0.2, 2.6), 0.24, 0.9, "dark", rotation=(math.pi / 2, 0.0, 0.0), segments=8)
        b.box((1.0 * sx, -0.4, 1.55), (0.06, 1.3, 0.9), "team")  # door panels
        b.between((0.9 * sx, -2.2, 0.08), (0.9 * sx, 1.6, 0.08), 0.06, "dark", segments=6)  # skids
        b.between((0.9 * sx, -2.2, 0.08), (0.9 * sx, -2.55, 0.3), 0.06, "dark", segments=6)
        for y in (-1.3, 0.8):
            b.between((0.9 * sx, y, 0.08), (0.55 * sx, y, 0.75), 0.05, "dark", segments=6)
        b.box((1.4 * sx, -0.1, 1.15), (0.9, 0.5, 0.08), "body")  # stub wing
        b.cylinder((1.75 * sx, -0.25, 1.0), 0.16, 1.0, "dark", rotation=(math.pi / 2, 0.0, 0.0), segments=8)  # rocket pod
    b.between((0.0, 1.0, 1.75), (0.0, 6.6, 2.1), 0.42, "body", segments=8, radius_end=0.16)
    fin(b, [(5.9, 1.9), (6.8, 1.9), (7.1, 3.5), (6.5, 3.5)], 0.0, 0.1, "team")
    plate(b, [(-0.9, 5.6), (0.9, 5.6), (0.9, 6.0), (-0.9, 6.0)], 2.05, 0.08, "body")
    b.wheel((0.12, 6.75, 3.0), 0.1, 0.12, "dark", segments=6)
    for k in range(2):
        b.box((0.18, 6.75, 3.0), (0.04, 0.12, 1.3), "dark", rotation=(k * math.pi / 2 + 0.4, 0.0, 0.0))
    # Main rotor.
    b.cylinder((0.0, -0.4, 3.05), 0.12, 0.5, "dark", segments=8)
    b.cylinder((0.0, -0.4, 3.32), 0.28, 0.12, "dark", segments=8)
    for k in range(4):
        a = k * math.pi / 2 + 0.4
        b.box((math.cos(a) * 2.9, -0.4 + math.sin(a) * 2.9, 3.34), (5.6, 0.32, 0.05), "dark", rotation=(0.0, 0.0, a))


def _cruise_missile(b: ShapeBuilder) -> None:
    z = 0.42
    b.between((0.0, -2.2, z), (0.0, 2.6, z), 0.28, "light", segments=10)
    b.between((0.0, -2.2, z), (0.0, -3.1, z), 0.28, "light", segments=10, radius_end=0.04)
    b.cylinder((0.0, 2.7, z), 0.24, 0.24, "dark", rotation=(math.pi / 2, 0.0, 0.0), segments=10)
    b.cylinder((0.0, -1.5, z), 0.285, 0.3, "team", rotation=(math.pi / 2, 0.0, 0.0), segments=10)  # band
    plate(b, [(-1.9, -0.1), (-1.9, 0.25), (1.9, 0.25), (1.9, -0.1), (0.0, -0.5)], z + 0.05, 0.06, "light")
    for sx in (-1.0, 1.0):
        plate(b, [(1.5 * sx, -0.18), (1.9 * sx, -0.1), (1.9 * sx, 0.25), (1.5 * sx, 0.25)] if sx > 0 else
              [(-1.9, -0.1), (-1.5, -0.18), (-1.5, 0.25), (-1.9, 0.25)], z + 0.05, 0.08, "team")
    for k in range(3):
        a = math.pi / 2 + k * 2 * math.pi / 3
        with b.placed((0.0, 2.2, z)):
            b.box((math.cos(a) * 0.45, 0.0, math.sin(a) * 0.45), (0.06, 0.5, 0.5), "team", rotation=(0.0, -a - math.pi / 2, 0.0))
    b.box((0.0, 1.4, z - 0.28), (0.3, 0.9, 0.2), "dark")  # intake


def _nuclear_missile(b: ShapeBuilder) -> None:
    # Launch pad with an erector frame.
    b.cylinder((0.0, 0.0, 0.15), 1.6, 0.3, "dark", segments=12)
    b.cylinder((0.0, 0.0, 0.36), 1.0, 0.12, "metal", segments=12)
    b.box((0.0, 1.35, 3.0), (0.3, 0.3, 5.4), "metal")
    for z in (1.6, 3.2, 4.6):
        b.box((0.0, 0.95, z), (0.12, 0.6, 0.12), "metal")
    # Three-stage missile, team warhead and fins.
    zb = 0.42
    b.cylinder((0.0, 0.0, zb + 1.6), 0.5, 3.2, "light", segments=12)
    b.cylinder((0.0, 0.0, zb + 3.25), 0.505, 0.1, "dark", segments=12)
    b.cylinder((0.0, 0.0, zb + 4.4), 0.46, 2.2, "light", segments=12, radius_top=0.44)
    b.cylinder((0.0, 0.0, zb + 5.55), 0.445, 0.1, "dark", segments=12)
    b.cylinder((0.0, 0.0, zb + 6.1), 0.44, 1.0, "light", segments=12, radius_top=0.4)
    b.cylinder((0.0, 0.0, zb + 6.85), 0.4, 0.5, "team", segments=12, radius_top=0.28)
    b.cone((0.0, 0.0, zb + 7.1), 0.28, 0.9, "team", segments=12)
    b.cylinder((0.0, 0.0, zb + 0.1), 0.42, 0.2, "dark", segments=10, radius_top=0.5)  # nozzle skirt
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        with b.placed((0.0, 0.0, zb + 0.6), yaw=a):
            b.extrude([(0.45, -0.4), (1.05, -0.4), (1.05, 0.0), (0.45, 1.0)], "y", -0.05, 0.05, "team")
    b.box((0.0, -0.5, zb + 2.2), (0.3, 0.04, 1.4), "dark")  # stencil band


def build(spec: AssetSpec) -> list[bpy.types.Object]:
    require_materials(spec.materials, MATERIAL_SLOTS, spec.generator)
    p = parse_params(spec.params)
    b = ShapeBuilder(MATERIAL_SLOTS)
    {
        "fighter": _fighter,
        "jet_fighter": _jet_fighter,
        "bomber": _bomber,
        "stealth_bomber": _stealth_bomber,
        "helicopter": _helicopter,
        "cruise_missile": _cruise_missile,
        "nuclear_missile": _nuclear_missile,
    }[p.kind](b)
    obj = b.to_object(spec.asset_id, spec.materials)
    finish(obj)
    return [obj]
