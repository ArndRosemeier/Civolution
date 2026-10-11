"""Shared shape kit for the Civolution strategy-game models.

Game pieces are read from far away, so they are built from a few clean closed
primitives (boxes, cylinders, cones, spheres, lofted hulls) with flat PBR materials
and no baked textures. Every primitive is its own watertight shell, so the QA
manifold gate holds. One material slot is called ``team``: the game tints it with
the owning civilization's colour.
"""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

from blender.lib.scene import make_material
from blender.lib.spec import MaterialSpec, SpecError

Vec3 = tuple[float, float, float]


class ShapeBuilder:
    """Accumulates closed primitives into one mesh with material slots."""

    def __init__(self, material_slots: Sequence[str]) -> None:
        self._slots = tuple(material_slots)
        self._bm = bmesh.new()

    def _index(self, slot: str) -> int:
        if slot not in self._slots:
            raise KeyError(f"Unknown material slot '{slot}'; have {list(self._slots)}")
        return self._slots.index(slot)

    def _tag(self, verts: Sequence[bmesh.types.BMVert], slot: str) -> None:
        index = self._index(slot)
        for face in {f for v in verts for f in v.link_faces}:
            face.material_index = index

    @staticmethod
    def _matrix(center: Vec3, rotation: Vec3 | None, scale: Vec3) -> Matrix:
        m = Matrix.Translation(Vector(center))
        if rotation is not None:
            m = m @ Euler(rotation).to_matrix().to_4x4()
        return m @ Matrix.Diagonal(Vector((scale[0], scale[1], scale[2], 1.0)))

    def box(self, center: Vec3, size: Vec3, slot: str, rotation: Vec3 | None = None) -> None:
        created = bmesh.ops.create_cube(self._bm, size=1.0, matrix=self._matrix(center, rotation, size))
        self._tag(created["verts"], slot)

    def cylinder(
        self,
        center: Vec3,
        radius: float,
        depth: float,
        slot: str,
        rotation: Vec3 | None = None,
        segments: int = 10,
        radius_top: float | None = None,
    ) -> None:
        """Cylinder (or frustum when radius_top differs) along local Z, centred on `center`."""
        top = radius if radius_top is None else radius_top
        created = bmesh.ops.create_cone(
            self._bm,
            cap_ends=True,
            cap_tris=False,
            segments=segments,
            radius1=radius,
            radius2=max(top, 1e-4),
            depth=depth,
            matrix=self._matrix(center, rotation, (1.0, 1.0, 1.0)),
        )
        self._tag(created["verts"], slot)

    def cone(self, base_center: Vec3, radius: float, height: float, slot: str, segments: int = 10) -> None:
        center = (base_center[0], base_center[1], base_center[2] + height * 0.5)
        created = bmesh.ops.create_cone(
            self._bm,
            cap_ends=True,
            cap_tris=True,
            segments=segments,
            radius1=radius,
            radius2=0.0,
            depth=height,
            matrix=self._matrix(center, None, (1.0, 1.0, 1.0)),
        )
        self._tag(created["verts"], slot)

    def sphere(self, center: Vec3, radius: Vec3 | float, slot: str, detail: int = 2) -> None:
        r = (radius, radius, radius) if isinstance(radius, (int, float)) else radius
        created = bmesh.ops.create_icosphere(
            self._bm, subdivisions=detail, radius=1.0, matrix=self._matrix(center, None, r)
        )
        self._tag(created["verts"], slot)

    def between(self, start: Vec3, end: Vec3, radius: float, slot: str, segments: int = 8, radius_end: float | None = None) -> None:
        """Cylinder from `start` to `end` (limbs, poles, handles)."""
        a = Vector(start)
        b = Vector(end)
        d = b - a
        if d.length < 1e-5:
            raise SpecError("zero-length segment")
        euler = d.normalized().to_track_quat("Z", "Y").to_euler()
        mid = (a + b) * 0.5
        self.cylinder((mid.x, mid.y, mid.z), radius, d.length, slot, (euler.x, euler.y, euler.z), segments, radius_end)

    def prism_roof(self, center: Vec3, length: float, width: float, height: float, slot: str, overhang: float = 0.0) -> None:
        """Gable roof: a triangular prism along X sitting on `center` (base height)."""
        hl = length * 0.5 + overhang
        hw = width * 0.5 + overhang
        cx, cy, cz = center
        verts = [
            (cx - hl, cy - hw, cz), (cx - hl, cy + hw, cz), (cx - hl, cy, cz + height),
            (cx + hl, cy - hw, cz), (cx + hl, cy + hw, cz), (cx + hl, cy, cz + height),
        ]
        faces = [(0, 2, 1), (3, 4, 5), (0, 3, 5, 2), (1, 2, 5, 4), (0, 1, 4, 3)]
        self.mesh(verts, faces, slot)

    def mesh(self, verts: Sequence[Vec3], faces: Sequence[Sequence[int]], slot: str) -> None:
        index = self._index(slot)
        created = [self._bm.verts.new(Vector(v)) for v in verts]
        for corners in faces:
            face = self._bm.faces.new([created[c] for c in corners])
            face.material_index = index

    def loft(self, sections: Sequence[Sequence[Vec3]], slot: str) -> None:
        """Closed loft through rings of equal vertex count (hulls). Ends are capped."""
        n = len(sections[0])
        verts = [v for ring in sections for v in ring]
        faces: list[tuple[int, ...]] = []
        for s in range(len(sections) - 1):
            for i in range(n):
                a = s * n + i
                b = s * n + (i + 1) % n
                c = (s + 1) * n + (i + 1) % n
                d = (s + 1) * n + i
                faces.append((a, b, c, d))
        faces.append(tuple(reversed(range(n))))
        last = (len(sections) - 1) * n
        faces.append(tuple(range(last, last + n)))
        self.mesh(verts, faces, slot)

    def to_object(self, name: str, materials: Mapping[str, MaterialSpec]) -> bpy.types.Object:
        bmesh.ops.recalc_face_normals(self._bm, faces=self._bm.faces)
        # Only slots a model actually uses become materials (glTF drops unused ones).
        used = sorted({f.material_index for f in self._bm.faces})
        remap = {old: new for new, old in enumerate(used)}
        for f in self._bm.faces:
            f.material_index = remap[f.material_index]
        mesh = bpy.data.meshes.new(name)
        self._bm.to_mesh(mesh)
        self._bm.free()
        obj = bpy.data.objects.new(name, mesh)
        bpy.data.scenes[0].collection.objects.link(obj)
        for old in used:
            slot = self._slots[old]
            if slot not in materials:
                raise SpecError(f"Spec has no material for slot '{slot}'")
            mesh.materials.append(make_material(slot, materials[slot]))
        return obj


def finish(obj: bpy.types.Object) -> None:
    """Origin at the footprint centre with the base on Z=0, flat shading, UVs."""
    from blender.lib.scene import shade_flat, unwrap, world_bounds

    lower, upper = world_bounds([obj])
    shift = Vector(((lower.x + upper.x) * 0.5, (lower.y + upper.y) * 0.5, lower.z))
    for v in obj.data.vertices:
        v.co -= shift
    obj.data.update()
    shade_flat(obj)
    unwrap(obj)


def rng(seed: int):
    import random

    return random.Random(seed)


def circle(radius: float, n: int, z: float = 0.0) -> list[Vec3]:
    return [(radius * math.cos(2 * math.pi * i / n), radius * math.sin(2 * math.pi * i / n), z) for i in range(n)]
