"""manifest 文件更新。"""

from __future__ import annotations

import json

from . import ANIMATIONS_ROOT
from .files import write_json


def update_manifest(action: str, metadata: dict[str, object], manifest_name: str) -> None:
    """更新 manifest 文件：已存在则替换同名条目，否则追加。"""
    manifest_path = ANIMATIONS_ROOT / manifest_name
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            manifest = []
    else:
        manifest = []

    if not isinstance(manifest, list):
        manifest = []

    updated = False
    for index, entry in enumerate(manifest):
        if isinstance(entry, dict) and entry.get("action") == action:
            manifest[index] = metadata
            updated = True
            break

    if not updated:
        manifest.append(metadata)

    write_json(manifest_path, manifest)
