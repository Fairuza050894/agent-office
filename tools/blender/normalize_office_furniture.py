"""Normalize Agent Office Kenney furniture materials with Blender.

Usage example:

blender --background --python tools/blender/normalize_office_furniture.py -- \
  --input frontend/public/assets/office/furniture/kenney-v1/desk.glb \
  --output /tmp/desk-agent-office.glb \
  --asset desk

This is an authoring/optimization helper, not a runtime dependency.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy


PALETTE = {
    "wood": (0.171, 0.086, 0.046, 1.0),
    "metal": (0.086, 0.125, 0.153, 1.0),
    "chair_frame": (0.034, 0.061, 0.080, 1.0),
    "chair_cushion": (0.047, 0.109, 0.159, 1.0),
    "device_dark": (0.009, 0.019, 0.029, 1.0),
    "device_mid": (0.086, 0.147, 0.181, 1.0),
    "screen": (0.051, 0.283, 0.417, 1.0),
}


def parse_args() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument(
        "--asset",
        required=True,
        choices=["desk", "chair", "screen", "keyboard", "mouse"],
    )
    return parser.parse_args(raw)


def color_for(asset: str, material_name: str):
    name = material_name.lower()
    if asset == "desk":
        return PALETTE["wood"] if "wood" in name else PALETTE["metal"]
    if asset == "chair":
        return (
            PALETTE["chair_cushion"]
            if "carpet" in name
            else PALETTE["chair_frame"]
        )
    if asset == "screen":
        return PALETTE["screen"] if name == "metal" else PALETTE["device_dark"]
    if asset == "keyboard":
        return (
            PALETTE["device_mid"]
            if "medium" in name
            else PALETTE["device_dark"]
        )
    return PALETTE["device_dark"]


def normalize_materials(asset: str) -> None:
    for material in bpy.data.materials:
        material.diffuse_color = color_for(asset, material.name)
        material.metallic = 0.08
        material.roughness = 0.76

        if asset == "screen" and material.name.lower() == "metal":
            material.diffuse_color = PALETTE["screen"]
            material.use_nodes = True
            principled = next(
                (
                    node
                    for node in material.node_tree.nodes
                    if node.type == "BSDF_PRINCIPLED"
                ),
                None,
            )
            if principled is not None:
                emission_color = (
                    principled.inputs.get("Emission Color")
                    or principled.inputs.get("Emission")
                )
                emission_strength = principled.inputs.get("Emission Strength")
                if emission_color is not None:
                    emission_color.default_value = (
                        0.008,
                        0.064,
                        0.109,
                        1.0,
                    )
                if emission_strength is not None:
                    emission_strength.default_value = 0.42


def main() -> None:
    args = parse_args()
    source = Path(args.input).resolve()
    target = Path(args.output).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source))

    normalize_materials(args.asset)

    # Keep transforms deterministic and remove unused authoring data.
    for obj in list(bpy.context.scene.objects):
        obj.select_set(obj.type == "MESH")
    bpy.context.view_layer.objects.active = next(
        (obj for obj in bpy.context.scene.objects if obj.type == "MESH"),
        None,
    )
    if bpy.context.view_layer.objects.active is not None:
        bpy.ops.object.transform_apply(
            location=False,
            rotation=True,
            scale=True,
        )

    bpy.data.orphans_purge(do_recursive=True)
    bpy.ops.export_scene.gltf(
        filepath=str(target),
        export_format="GLB",
        export_apply=True,
        export_materials="EXPORT",
    )


if __name__ == "__main__":
    main()
