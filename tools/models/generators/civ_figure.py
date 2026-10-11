"""Civolution foot units: a stylised low-poly figure plus kit per role.

Faces -Y. Roughly 1.8 m tall; the game scales it to the tile. Slots: skin, hair,
cloth, team (tinted per civilization in game), leather, wood, metal.

The body, arm and kit helpers are shared with ``civ_mounted`` (riders) and reused
here for groups (``army``) through ``ShapeBuilder.placed``.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass

import bpy

from blender.generators.civ_common import ShapeBuilder, Vec3, finish
from blender.lib.spec import AssetSpec, SpecError, as_int, as_str, reject_unknown, require_key, require_materials

MATERIAL_SLOTS: tuple[str, ...] = ("skin", "hair", "cloth", "team", "leather", "wood", "metal")
KINDS = (
    "warrior", "settler", "worker", "scout", "explorer", "spearman", "archer",
    "swordsman", "pikeman", "longbowman", "medieval_infantry",
    "musketman", "rifleman", "infantry", "marine", "paratrooper",
    "leader", "army",
)

# Lower-body style per kind: leg material, tunic skirt or coat length (0 = trousers), boots.
_BARE_LEGS = ("warrior", "spearman", "swordsman", "horseman", "charioteer")
_ARMOURED_LEGS = ("knight",)
_COAT = {"musketman": 0.42, "leader": 0.3, "medieval_infantry": 0.3, "pikeman": 0.22}
_TROUSERS = ("rifleman", "infantry", "marine", "paratrooper", "cavalry")
_BOOTS = ("musketman", "rifleman", "infantry", "marine", "paratrooper", "leader", "pikeman", "cavalry")


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


def body(b: ShapeBuilder, kind: str, seated: bool = False) -> None:
    """Legs, hips, torso, neck and head. Seated figures straddle a saddle at z = 0.84."""
    legs = "skin" if kind in _BARE_LEGS else "metal" if kind in _ARMOURED_LEGS else "cloth"
    boots = kind in _BOOTS
    for sx in (-1.0, 1.0):
        x = 0.1 * sx
        if seated:
            knee = (0.31 * sx, -0.24, 0.62)
            foot = (0.33 * sx, -0.12, 0.26)
            b.between((x, 0.0, 0.84), knee, 0.075, legs, radius_end=0.068)
            b.between(knee, foot, 0.066, "leather" if boots else legs, radius_end=0.06)
            b.box((foot[0], foot[1] - 0.05, foot[2] - 0.03), (0.1, 0.22, 0.08), "leather")
        else:
            b.box((x, -0.04, 0.045), (0.11, 0.24, 0.09), "leather")
            b.between((x, 0.0, 0.08), (x, 0.0, 0.84), 0.068, legs, radius_end=0.075)
            if boots:
                b.cylinder((x, 0.0, 0.25), 0.078, 0.34, "leather", radius_top=0.082, segments=8)
    skirt = 0.18 if kind not in _TROUSERS else 0.0
    skirt = _COAT.get(kind, skirt)
    if skirt > 0.0 and not seated:
        flare = 0.25 if skirt <= 0.18 else 0.235 + (skirt - 0.18) * 0.05
        b.cylinder((0.0, 0.0, 0.88 - skirt * 0.5), flare, skirt, "team", radius_top=0.21, segments=12)
    elif skirt > 0.0:
        b.cylinder((0.0, 0.0, 0.8), 0.25, 0.14, "team", radius_top=0.21, segments=12)
    else:
        b.cylinder((0.0, 0.0, 0.84), 0.19, 0.14, "cloth", radius_top=0.2, segments=12)  # hips
    b.cylinder((0.0, 0.0, 1.13), 0.2, 0.52, "team", radius_top=0.18, segments=12)
    b.cylinder((0.0, 0.0, 0.89), 0.215, 0.07, "leather", segments=12)
    b.box((0.0, -0.215, 0.89), (0.07, 0.03, 0.06), "metal")  # buckle
    if 0.0 < skirt < 0.25 and not seated:
        b.box((0.0, -0.235, 0.74), (0.14, 0.03, 0.22), "cloth")  # front flap
    b.sphere((0.0, 0.09, 1.53), (0.09, 0.06, 0.07), "hair", detail=1)  # hair at the nape
    b.cylinder((0.0, 0.0, 1.43), 0.06, 0.1, "skin", segments=8)
    b.sphere((0.0, 0.0, 1.58), (0.12, 0.125, 0.145), "skin")
    b.sphere((0.0, -0.11, 1.57), (0.025, 0.03, 0.03), "skin", detail=1)  # nose


def arm(b: ShapeBuilder, side: float, hand: Vec3, sleeve: str = "skin", elbow: Vec3 | None = None, shoulder_slot: str = "team") -> None:
    shoulder = (0.22 * side, 0.0, 1.34)
    elbow = elbow or (0.27 * side, 0.03, 1.08)
    b.sphere(shoulder, 0.075, shoulder_slot, detail=1)
    b.between(shoulder, elbow, 0.055, sleeve)
    b.between(elbow, hand, 0.05, sleeve, radius_end=0.045)
    b.sphere(hand, 0.055, "skin", detail=1)


def hair(b: ShapeBuilder) -> None:
    b.sphere((0.0, 0.02, 1.63), (0.127, 0.125, 0.11), "hair")


# Names used by the original kits.
_body = body
_hair = hair


def _arm(b: ShapeBuilder, side: float, hand: Vec3, sleeve: str = "skin") -> None:
    """Original arm: forearm always bare skin."""
    shoulder = (0.22 * side, 0.0, 1.34)
    elbow = (0.27 * side, 0.03, 1.08)
    b.sphere(shoulder, 0.075, "team", detail=1)
    b.between(shoulder, elbow, 0.055, sleeve)
    b.between(elbow, hand, 0.05, "skin", radius_end=0.045)
    b.sphere(hand, 0.055, "skin", detail=1)


def curved_panel(b: ShapeBuilder, width: float, height: float, thickness: float, bulge: float, slot: str, segments: int = 5) -> None:
    """A shield-like slab centred on the origin, facing -Y, bowed towards -Y by `bulge`."""
    outer: list[tuple[float, float]] = []
    inner: list[tuple[float, float]] = []
    for i in range(segments + 1):
        t = i / segments
        x = (t - 0.5) * width
        y = -bulge * (1.0 - (2.0 * t - 1.0) ** 2)
        outer.append((x, y - thickness * 0.5))
        inner.append((x, y + thickness * 0.5))
    ring = outer + list(reversed(inner))
    b.extrude(ring, "z", -height * 0.5, height * 0.5, slot)


def kite_shield(b: ShapeBuilder, slot: str, rim: str | None = None) -> None:
    """Kite shield centred on the origin in the XZ plane, facing -Y."""
    outline = [(-0.2, 0.3), (0.2, 0.3), (0.22, 0.12), (0.12, -0.18), (0.0, -0.36), (-0.12, -0.18), (-0.22, 0.12)]
    b.extrude(outline, "y", -0.025, 0.025, slot)
    if rim is not None:
        b.box((0.0, -0.03, 0.27), (0.4, 0.02, 0.04), rim)
        b.sphere((0.0, -0.04, 0.06), (0.07, 0.04, 0.07), rim, detail=1)


def flag(b: ShapeBuilder, top: Vec3, width: float, height: float, slot: str, wave: float = 0.06, side: float = 1.0) -> None:
    """A banner hanging from a pole top, streaming towards +X*side, gently waved."""
    x0, y0, z0 = top
    n = 4
    front = [(x0 + side * width * i / n, y0 + wave * math.sin(i * 1.7)) for i in range(n + 1)]
    ring = [(x, y - 0.012) for x, y in front] + [(x, y + 0.012) for x, y in reversed(front)]
    b.extrude(ring, "z", z0 - height, z0, slot)


def rifle(b: ShapeBuilder, butt: Vec3, muzzle: Vec3, bayonet: bool = False, scale: float = 1.0) -> None:
    """Wooden stock running into a metal barrel, from butt to muzzle."""
    bx, by, bz = butt
    mx, my, mz = muzzle
    split = 0.55
    mid = (bx + (mx - bx) * split, by + (my - by) * split, bz + (mz - bz) * split)
    b.between(butt, mid, 0.04 * scale, "wood", segments=6, radius_end=0.026 * scale)
    b.between(mid, muzzle, 0.016 * scale, "metal", segments=6)
    if bayonet:
        d = (mx - bx, my - by, mz - bz)
        length = math.sqrt(sum(c * c for c in d))
        tip = (mx + d[0] / length * 0.28, my + d[1] / length * 0.28, mz + d[2] / length * 0.28)
        b.between(muzzle, tip, 0.014, "metal", segments=4, radius_end=0.002)


def kit(b: ShapeBuilder, k: str) -> None:
    """Head gear, arms, weapons and gear for one kind (the body is already built)."""
    right = (0.27, -0.16, 0.92)
    left = (-0.27, -0.12, 0.95)
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
    elif k in _KITS:
        _KITS[k](b)
    else:
        raise SpecError(f"no kit for kind {k!r}")


def _swordsman(b: ShapeBuilder) -> None:
    # Crested helmet with cheek guards and a neck guard.
    b.sphere((0.0, 0.01, 1.64), (0.142, 0.145, 0.115), "metal")
    b.box((0.0, 0.11, 1.56), (0.22, 0.06, 0.07), "metal", rotation=(0.5, 0.0, 0.0))
    for sx in (-1.0, 1.0):
        b.box((0.115 * sx, -0.04, 1.54), (0.03, 0.1, 0.12), "metal")
    b.box((0.0, 0.01, 1.78), (0.035, 0.08, 0.06), "metal")
    b.extrude([(-0.17, 1.8), (0.15, 1.8), (0.13, 1.9), (0.02, 1.95), (-0.12, 1.93), (-0.2, 1.86)], "x", -0.03, 0.03, "team")
    # Banded cuirass and greaves.
    b.cylinder((0.0, 0.0, 1.2), 0.212, 0.34, "metal", radius_top=0.192, segments=12)
    for z in (1.08, 1.18, 1.28):
        b.cylinder((0.0, 0.0, z), 0.216 - (z - 1.08) * 0.1, 0.025, "leather", segments=12)
    for sx in (-1.0, 1.0):
        b.cylinder((0.1 * sx, -0.01, 0.3), 0.078, 0.3, "metal", radius_top=0.082, segments=8)
    # Sword raised in the right hand.
    hand = (0.28, -0.24, 1.02)
    arm(b, 1.0, hand, elbow=(0.3, -0.04, 1.08), shoulder_slot="metal")
    b.box((0.28, -0.25, 1.06), (0.16, 0.05, 0.03), "metal")  # guard
    b.between((0.28, -0.25, 1.07), (0.28, -0.38, 1.6), 0.03, "metal", segments=4, radius_end=0.012)
    b.between((0.28, -0.24, 0.96), (0.28, -0.23, 1.02), 0.022, "leather", segments=6)
    # Tall curved shield on the left arm.
    arm(b, -1.0, (-0.26, -0.26, 1.0), elbow=(-0.3, -0.06, 1.1), shoulder_slot="metal")
    with b.placed((-0.2, -0.36, 0.95), yaw=-0.35):
        curved_panel(b, 0.5, 0.82, 0.05, 0.1, "team")
        b.box((0.0, -0.1, 0.39), (0.46, 0.04, 0.035), "metal")
        b.box((0.0, -0.1, -0.39), (0.46, 0.04, 0.035), "metal")
        b.sphere((0.0, -0.13, 0.0), (0.08, 0.05, 0.08), "metal", detail=1)


def _pikeman(b: ShapeBuilder) -> None:
    # Morion: dome, boat brim and a comb.
    b.sphere((0.0, 0.01, 1.66), (0.14, 0.15, 0.12), "metal")
    b.sphere((0.0, 0.01, 1.64), (0.2, 0.27, 0.035), "metal", detail=2)
    b.extrude([(-0.15, 1.7), (0.15, 1.7), (0.1, 1.82), (-0.1, 1.82)], "x", -0.015, 0.015, "metal")
    # Breastplate over puffed team sleeves.
    b.cylinder((0.0, -0.01, 1.18), 0.215, 0.38, "metal", radius_top=0.195, segments=12)
    b.box((0.0, -0.21, 1.18), (0.03, 0.04, 0.32), "metal")  # ridge
    butt = (0.1, 0.5, 0.06)
    tip = (0.16, -1.42, 2.3)

    def along(t: float) -> Vec3:
        return (butt[0] + (tip[0] - butt[0]) * t, butt[1] + (tip[1] - butt[1]) * t, butt[2] + (tip[2] - butt[2]) * t)

    arm(b, 1.0, along(0.33), sleeve="team", elbow=(0.3, 0.12, 1.05))
    arm(b, -1.0, along(0.5), sleeve="team", elbow=(-0.24, -0.15, 1.1))
    b.between(butt, along(0.95), 0.022, "wood", segments=6)
    b.between(along(0.95), tip, 0.03, "metal", segments=4, radius_end=0.003)
    flag(b, along(0.9), 0.24, 0.13, "team", wave=0.03)
    b.cylinder((-0.2, 0.04, 0.72), 0.03, 0.4, "leather", rotation=(0.25, 0.0, 0.0), segments=6)  # scabbard


def _longbowman(b: ShapeBuilder) -> None:
    # Hood with a short shoulder cape and a long tail.
    b.sphere((0.0, 0.025, 1.61), (0.148, 0.152, 0.16), "cloth")
    b.cylinder((0.0, 0.01, 1.4), 0.27, 0.14, "cloth", radius_top=0.14, segments=12)
    b.between((0.0, 0.12, 1.66), (0.0, 0.34, 1.32), 0.04, "cloth", segments=6, radius_end=0.01)
    bow_hand = (-0.2, -0.56, 1.36)
    draw_hand = (0.12, -0.04, 1.42)
    arm(b, -1.0, bow_hand, sleeve="cloth", elbow=(-0.24, -0.3, 1.36))
    arm(b, 1.0, draw_hand, sleeve="cloth", elbow=(0.36, 0.06, 1.38))
    top = (-0.2, -0.46, 2.18)
    bottom = (-0.2, -0.46, 0.54)
    b.between(bottom, (-0.2, -0.6, 0.95), 0.018, "wood", segments=6, radius_end=0.024)
    b.between((-0.2, -0.6, 0.95), (-0.2, -0.62, 1.77), 0.024, "wood", segments=6)
    b.between((-0.2, -0.6, 1.77), top, 0.024, "wood", segments=6, radius_end=0.018)
    b.between(top, draw_hand, 0.006, "cloth", segments=4)
    b.between(draw_hand, bottom, 0.006, "cloth", segments=4)
    b.between(draw_hand, (-0.21, -0.82, 1.35), 0.01, "wood", segments=4)  # arrow
    b.between((-0.21, -0.82, 1.35), (-0.215, -0.9, 1.35), 0.02, "metal", segments=4, radius_end=0.002)
    # Quiver with team fletchings.
    b.box((-0.08, 0.21, 1.12), (0.12, 0.12, 0.55), "leather", rotation=(0.25, 0.0, -0.3))
    for i, dx in enumerate((-0.03, 0.02, 0.06)):
        b.box((-0.19 + dx, 0.29 + 0.01 * i, 1.43), (0.03, 0.03, 0.12), "team", rotation=(0.25, 0.0, -0.3))


def _medieval_infantry(b: ShapeBuilder) -> None:
    # Mail coif under a conical nasal helm.
    b.sphere((0.0, 0.02, 1.6), (0.15, 0.15, 0.155), "metal")
    b.cone((0.0, 0.01, 1.66), 0.145, 0.16, "metal", segments=10)
    b.box((0.0, -0.135, 1.6), (0.03, 0.03, 0.12), "metal")
    b.cylinder((0.0, 0.0, 1.38), 0.21, 0.08, "metal", radius_top=0.14, segments=12)
    hand = (0.3, -0.18, 1.32)
    arm(b, 1.0, hand, sleeve="metal", elbow=(0.36, 0.02, 1.12))
    b.between((0.3, -0.18, 1.2), (0.26, -0.05, 1.95), 0.025, "wood", segments=6)  # axe haft over shoulder
    with b.placed((0.265, -0.07, 1.84)):
        b.extrude([(0.0, -0.05), (-0.18, -0.12), (-0.22, 0.04), (-0.18, 0.2), (0.0, 0.1)], "x", -0.02, 0.02, "metal")
    arm(b, -1.0, (-0.28, -0.2, 1.0), sleeve="metal", elbow=(-0.32, -0.04, 1.12))
    with b.placed((-0.24, -0.33, 0.98), yaw=-0.3):
        kite_shield(b, "team", rim="metal")


def tricorn(b: ShapeBuilder, slot: str) -> None:
    b.cylinder((0.0, 0.01, 1.72), 0.12, 0.12, slot, radius_top=0.1, segments=10)
    for i in range(3):
        a = -math.pi / 2 + i * 2 * math.pi / 3
        cx, cy = 0.13 * math.cos(a), 0.13 * math.sin(a) + 0.01
        b.box((cx, cy, 1.71), (0.3, 0.035, 0.1), slot, rotation=(0.0, 0.0, a + math.pi / 2))


def _musketman(b: ShapeBuilder) -> None:
    _hair(b)
    tricorn(b, "hair")
    b.box((0.0, -0.19, 1.15), (0.1, 0.06, 0.42), "cloth")  # waistcoat front
    for sx in (-1.0, 1.0):  # white cross belts
        b.box((0.0, -0.205, 1.12), (0.05, 0.02, 0.6), "cloth", rotation=(0.0, 0.62 * sx, 0.0))
    b.box((0.21, 0.04, 0.86), (0.08, 0.16, 0.13), "leather")  # cartridge box
    arm(b, 1.0, (0.28, -0.08, 0.98), sleeve="team", elbow=(0.3, 0.06, 1.1))
    rifle(b, (0.29, -0.08, 0.86), (0.31, 0.06, 2.12), bayonet=True)
    b.cylinder((0.27, -0.06, 1.0), 0.058, 0.08, "cloth", segments=8)  # cuff
    arm(b, -1.0, (-0.28, -0.1, 0.92), sleeve="team")


def _rifleman(b: ShapeBuilder) -> None:
    _hair(b)
    # Peaked cap in team colour with a dark visor.
    b.cylinder((0.0, 0.0, 1.73), 0.13, 0.13, "team", radius_top=0.14, segments=12)
    b.box((0.0, -0.13, 1.68), (0.2, 0.1, 0.02), "hair", rotation=(-0.2, 0.0, 0.0))
    b.cylinder((0.0, 0.0, 1.8), 0.141, 0.02, "hair", segments=12)
    b.box((0.0, -0.205, 1.12), (0.04, 0.02, 0.48), "metal")  # button row
    b.box((0.0, 0.2, 1.17), (0.32, 0.12, 0.3), "leather")  # pack
    b.cylinder((0.0, 0.21, 1.37), 0.06, 0.38, "cloth", rotation=(0.0, math.pi / 2, 0.0), segments=8)
    for sx in (-1.0, 1.0):
        b.box((0.1 * sx, -0.2, 0.9), (0.08, 0.05, 0.08), "leather")  # ammo pouches
    rh = (0.17, -0.27, 0.98)
    lh = (-0.15, -0.3, 1.3)
    arm(b, 1.0, rh, sleeve="team", elbow=(0.3, -0.05, 1.08))
    arm(b, -1.0, lh, sleeve="team", elbow=(-0.32, -0.12, 1.15))
    rifle(b, (0.26, -0.22, 0.82), (-0.22, -0.33, 1.6), bayonet=True)


def _infantry(b: ShapeBuilder) -> None:
    # Bowl helmet with a wide brim, webbing, pack and entrenching tool.
    b.sphere((0.0, 0.01, 1.66), (0.15, 0.155, 0.12), "metal")
    b.cylinder((0.0, 0.01, 1.64), 0.2, 0.02, "metal", segments=14)
    b.box((0.0, -0.205, 1.15), (0.24, 0.02, 0.05), "leather", rotation=(0.0, 0.5, 0.0))
    b.box((0.0, 0.21, 1.14), (0.32, 0.14, 0.36), "leather")
    b.box((0.0, 0.29, 0.95), (0.08, 0.04, 0.22), "wood")
    b.box((0.0, 0.3, 0.84), (0.13, 0.03, 0.12), "metal")
    for sx in (-1.0, 0.0, 1.0):
        b.box((0.11 * sx, -0.21, 0.9), (0.07, 0.05, 0.08), "leather")
    rh = (0.22, -0.26, 1.02)
    lh = (-0.06, -0.44, 1.13)
    arm(b, 1.0, rh, sleeve="team", elbow=(0.33, 0.0, 1.08))
    arm(b, -1.0, lh, sleeve="team", elbow=(-0.3, -0.18, 1.1))
    rifle(b, (0.28, -0.12, 0.98), (-0.12, -0.86, 1.2))


def _marine(b: ShapeBuilder) -> None:
    # Modern helmet with goggles band, plate carrier, rifle aimed.
    b.sphere((0.0, 0.015, 1.65), (0.155, 0.16, 0.13), "cloth")
    b.cylinder((0.0, 0.015, 1.63), 0.158, 0.06, "cloth", segments=12)
    b.box((0.0, -0.14, 1.69), (0.17, 0.04, 0.05), "hair")
    b.cylinder((0.0, 0.0, 1.16), 0.215, 0.34, "leather", radius_top=0.2, segments=8)  # plate carrier
    for sx in (-1.0, 0.0, 1.0):
        b.box((0.09 * sx, -0.22, 1.08), (0.075, 0.05, 0.1), "leather")
    b.box((0.0, 0.22, 1.18), (0.26, 0.08, 0.28), "leather")  # assault pack
    for sx in (-1.0, 1.0):
        b.box((0.1 * sx, -0.08, 0.52), (0.1, 0.04, 0.08), "hair")  # knee pads
    stock = (0.17, -0.1, 1.33)
    muzzle = (0.1, -0.86, 1.36)
    arm(b, 1.0, (0.19, -0.24, 1.26), sleeve="cloth", elbow=(0.36, -0.08, 1.12))
    arm(b, -1.0, (0.06, -0.5, 1.29), sleeve="cloth", elbow=(-0.22, -0.32, 1.12))
    b.between(stock, (0.14, -0.4, 1.34), 0.035, "hair", segments=6)
    b.box((0.13, -0.38, 1.28), (0.04, 0.05, 0.12), "hair")  # magazine
    b.between((0.14, -0.4, 1.34), muzzle, 0.02, "hair", segments=6)
    b.box((0.135, -0.3, 1.4), (0.03, 0.12, 0.04), "hair")  # optic


def _paratrooper(b: ShapeBuilder) -> None:
    b.sphere((0.0, 0.01, 1.655), (0.148, 0.152, 0.12), "metal")
    for sx in (-1.0, 1.0):
        b.box((0.12 * sx, -0.03, 1.52), (0.02, 0.03, 0.14), "leather")  # chin straps
    # Main parachute pack on the back, reserve on the chest, harness straps.
    b.box((0.0, 0.26, 1.08), (0.38, 0.2, 0.56), "cloth")
    b.box((0.0, 0.37, 1.08), (0.3, 0.04, 0.44), "team")
    b.box((0.0, -0.25, 1.0), (0.3, 0.12, 0.18), "cloth")
    for sx in (-1.0, 1.0):
        b.box((0.11 * sx, -0.205, 1.2), (0.05, 0.02, 0.4), "leather")
    for sx in (-1.0, 1.0):
        b.box((0.15 * sx, -0.06, 0.62), (0.05, 0.08, 0.13), "cloth")  # cargo pockets
    rh = (0.18, -0.28, 0.95)
    lh = (-0.08, -0.42, 1.0)
    arm(b, 1.0, rh, sleeve="team", elbow=(0.32, -0.04, 1.06))
    arm(b, -1.0, lh, sleeve="team", elbow=(-0.3, -0.16, 1.08))
    b.between((0.24, -0.18, 0.95), (-0.08, -0.62, 1.04), 0.035, "hair", segments=6)  # SMG
    b.box((0.06, -0.38, 0.9), (0.04, 0.05, 0.14), "hair", rotation=(0.0, 0.0, 0.6))


def _leader(b: ShapeBuilder) -> None:
    _hair(b)
    # Plumed helmet, gilded cuirass, cape, sword at the hip and the great banner.
    b.sphere((0.0, 0.01, 1.66), (0.14, 0.145, 0.11), "metal")
    b.cylinder((0.0, 0.01, 1.61), 0.148, 0.04, "metal", segments=14)
    b.extrude([(-0.08, 1.74), (0.06, 1.76), (0.16, 1.86), (0.3, 1.82), (0.22, 1.98), (0.04, 2.0), (-0.1, 1.86)], "x", -0.03, 0.03, "team")
    b.cylinder((0.0, -0.005, 1.17), 0.218, 0.42, "metal", radius_top=0.198, segments=12)
    for sx in (-1.0, 1.0):
        b.sphere((0.24 * sx, 0.0, 1.37), (0.11, 0.1, 0.06), "metal", detail=1)  # pauldrons
    with b.placed((0.0, 0.25, 0.78), yaw=math.pi):
        curved_panel(b, 0.6, 1.3, 0.035, 0.16, "team", segments=6)
    b.cylinder((0.0, 0.11, 1.4), 0.2, 0.06, "team", segments=10)  # cape collar
    pole_x, pole_y = 0.3, -0.22
    arm(b, 1.0, (pole_x, pole_y, 1.18), elbow=(0.34, -0.02, 1.12))
    arm(b, -1.0, (-0.25, -0.18, 0.92), elbow=(-0.32, 0.0, 1.1))
    b.between((-0.25, -0.2, 0.95), (-0.32, 0.25, 0.5), 0.03, "leather", segments=6)  # scabbard
    b.box((-0.25, -0.21, 0.97), (0.14, 0.03, 0.03), "metal")
    b.between((pole_x, pole_y, 0.02), (pole_x, pole_y, 2.75), 0.03, "wood", segments=8)
    b.sphere((pole_x, pole_y, 2.8), 0.06, "metal", detail=1)
    b.cone((pole_x, pole_y, 2.84), 0.04, 0.16, "metal", segments=6)
    b.between((pole_x, pole_y, 2.66), (pole_x + 0.78, pole_y, 2.66), 0.018, "wood", segments=6)
    flag(b, (pole_x + 0.02, pole_y, 2.65), 0.74, 0.9, "team", wave=0.07)
    for i in range(4):
        b.box((pole_x + 0.1 + i * 0.19, pole_y + 0.07 * math.sin((i + 0.5) * 1.6), 1.72), (0.06, 0.03, 0.12), "metal")  # fringe


def _army(b: ShapeBuilder) -> None:
    """Three smaller soldiers round a team-coloured standard."""
    for kind, (x, y), yaw in (("swordsman", (-0.48, -0.32), 0.35), ("spearman", (0.48, -0.32), -0.35), ("archer", (0.0, 0.44), 0.0)):
        with b.placed((x, y, 0.0), scale=0.82, yaw=yaw):
            body(b, kind)
            kit(b, kind)
    b.cylinder((0.0, 0.0, 0.06), 0.22, 0.12, "wood", segments=10)
    b.between((0.0, 0.0, 0.1), (0.0, 0.0, 2.7), 0.032, "wood", segments=8)
    b.between((-0.36, 0.0, 2.6), (0.36, 0.0, 2.6), 0.02, "wood", segments=6)
    b.extrude([(-0.34, 2.6), (0.34, 2.6), (0.34, 1.86), (0.0, 1.66), (-0.34, 1.86)], "y", -0.025, 0.025, "team")
    b.box((0.0, -0.035, 2.18), (0.3, 0.02, 0.3), "metal")
    b.sphere((0.0, 0.0, 2.76), 0.07, "metal", detail=1)
    for sx in (-1.0, 1.0):
        b.sphere((0.36 * sx, 0.0, 2.6), 0.035, "metal", detail=1)


_KITS = {
    "swordsman": _swordsman,
    "pikeman": _pikeman,
    "longbowman": _longbowman,
    "medieval_infantry": _medieval_infantry,
    "musketman": _musketman,
    "rifleman": _rifleman,
    "infantry": _infantry,
    "marine": _marine,
    "paratrooper": _paratrooper,
    "leader": _leader,
}


def build(spec: AssetSpec) -> list[bpy.types.Object]:
    require_materials(spec.materials, MATERIAL_SLOTS, spec.generator)
    p = parse_params(spec.params)
    b = ShapeBuilder(MATERIAL_SLOTS)
    if p.kind == "army":
        _army(b)
    else:
        _body(b, p.kind)
        kit(b, p.kind)
    obj = b.to_object(spec.asset_id, spec.materials)
    finish(obj)
    return [obj]
