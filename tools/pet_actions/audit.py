"""动作资源几何审计。"""

from __future__ import annotations

import json
from pathlib import Path
from statistics import median

import numpy as np
from PIL import Image

from . import ALPHA_CROP_THRESHOLD, ANIMATIONS_ROOT
from .chroma import detect_ground_alpha_remnants, get_frame_geometry


def _frame_paths(action_dir: Path, frame_folder: str = "transparent_frames") -> list[Path]:
    return sorted((action_dir / frame_folder).glob("frame_*.png"))


def _round(value: float, digits: int = 3) -> float:
    return round(float(value), digits)


def _measure_frame(path: Path) -> dict[str, object]:
    image = Image.open(path).convert("RGBA")
    alpha = np.array(image.getchannel("A")).astype(np.float32)
    geometry = get_frame_geometry(image, ALPHA_CROP_THRESHOLD)
    if geometry is None:
        return {
            "file": path.name,
            "size": [image.width, image.height],
            "bounds": None,
            "centerX": None,
            "centerY": None,
            "gravityX": None,
            "gravityY": None,
            "groundAlpha": detect_ground_alpha_remnants(image),
        }

    yy, xx = np.indices(alpha.shape)
    weights = np.clip(alpha, 0, 255)
    if float(weights.sum()) > 0:
        gravity_x = float((xx * weights).sum() / weights.sum())
        gravity_y = float((yy * weights).sum() / weights.sum())
    else:
        gravity_x = float(geometry["centerX"])
        gravity_y = float(geometry["centerY"])

    return {
        "file": path.name,
        "size": [image.width, image.height],
        "bounds": {
            "left": int(geometry["left"]),
            "top": int(geometry["top"]),
            "right": int(geometry["right"]),
            "bottom": int(geometry["bottom"]),
            "width": int(geometry["width"]),
            "height": int(geometry["height"]),
        },
        "centerX": _round(float(geometry["centerX"])),
        "centerY": _round(float(geometry["centerY"])),
        "gravityX": _round(gravity_x),
        "gravityY": _round(gravity_y),
        "groundAlpha": detect_ground_alpha_remnants(image),
    }


def _values(frames: list[dict[str, object]], key: str) -> list[float]:
    return [float(frame[key]) for frame in frames if frame.get(key) is not None]


def _bounds_values(frames: list[dict[str, object]], key: str) -> list[float]:
    values: list[float] = []
    for frame in frames:
        bounds = frame.get("bounds")
        if isinstance(bounds, dict):
            values.append(float(bounds[key]))
    return values


def _margin_delta_x(frame: dict[str, object]) -> float | None:
    bounds = frame.get("bounds")
    size = frame.get("size")
    if not isinstance(bounds, dict) or not isinstance(size, list) or not size:
        return None
    width = float(size[0])
    left_margin = float(bounds["left"])
    right_margin = width - 1.0 - float(bounds["right"])
    return left_margin - right_margin


def _canvas_center_delta_x(frame: dict[str, object]) -> float | None:
    size = frame.get("size")
    center_x = frame.get("centerX")
    if not isinstance(size, list) or not size or center_x is None:
        return None
    return float(center_x) - float(size[0]) / 2.0


def _optional_values(values: list[float | None]) -> list[float]:
    return [float(value) for value in values if value is not None]


def _median(values: list[float]) -> float:
    return _round(median(values)) if values else 0.0


def _range(values: list[float]) -> float:
    return _round(max(values) - min(values)) if values else 0.0


def summarize_action_frames(action_dir: Path, frame_folder: str = "transparent_frames") -> dict[str, object]:
    """Summarize transparent frame geometry for one action directory."""
    frames = [_measure_frame(path) for path in _frame_paths(action_dir, frame_folder)]
    if not frames:
        raise RuntimeError(f"No frame_*.png files found in {action_dir / frame_folder}")

    size_keys = sorted({tuple(frame["size"]) for frame in frames})  # type: ignore[arg-type]
    ground_infos = [frame["groundAlpha"] for frame in frames if isinstance(frame.get("groundAlpha"), dict)]
    low_rows = [int(info.get("lowRows", 0)) for info in ground_infos]
    low_pixels = [int(info.get("lowPixels", 0)) for info in ground_infos]
    first = frames[0]
    last = frames[-1]
    canvas_center_delta_x = _optional_values([_canvas_center_delta_x(frame) for frame in frames])
    margin_delta_x = _optional_values([_margin_delta_x(frame) for frame in frames])

    return {
        "action": action_dir.name,
        "frameFolder": frame_folder,
        "frameCount": len(frames),
        "sizes": [list(size) for size in size_keys],
        "first": first,
        "last": last,
        "median": {
            "left": _median(_bounds_values(frames, "left")),
            "top": _median(_bounds_values(frames, "top")),
            "right": _median(_bounds_values(frames, "right")),
            "bottom": _median(_bounds_values(frames, "bottom")),
            "width": _median(_bounds_values(frames, "width")),
            "height": _median(_bounds_values(frames, "height")),
            "centerX": _median(_values(frames, "centerX")),
            "centerY": _median(_values(frames, "centerY")),
            "gravityX": _median(_values(frames, "gravityX")),
            "gravityY": _median(_values(frames, "gravityY")),
        },
        "canvas": {
            "firstCenterDeltaX": _round(_canvas_center_delta_x(first) or 0.0),
            "medianCenterDeltaX": _median(canvas_center_delta_x),
            "maxAbsCenterDeltaX": _round(max((abs(value) for value in canvas_center_delta_x), default=0.0)),
            "firstMarginDeltaX": _round(_margin_delta_x(first) or 0.0),
            "medianMarginDeltaX": _median(margin_delta_x),
            "maxAbsMarginDeltaX": _round(max((abs(value) for value in margin_delta_x), default=0.0)),
        },
        "range": {
            "centerX": _range(_values(frames, "centerX")),
            "centerY": _range(_values(frames, "centerY")),
            "width": _range(_bounds_values(frames, "width")),
            "height": _range(_bounds_values(frames, "height")),
            "bottom": _range(_bounds_values(frames, "bottom")),
        },
        "seam": _build_delta(first, last),
        "groundAlpha": {
            "maxLowRows": max(low_rows) if low_rows else 0,
            "p90LowRows": _round(float(np.percentile(low_rows, 90))) if low_rows else 0.0,
            "maxLowPixels": max(low_pixels) if low_pixels else 0,
            "framesWithLowRows": sum(1 for value in low_rows if value > 0),
        },
    }


def _build_delta(base: dict[str, object], target: dict[str, object]) -> dict[str, float]:
    base_bounds = base.get("bounds")
    target_bounds = target.get("bounds")
    if not isinstance(base_bounds, dict) or not isinstance(target_bounds, dict):
        return {"centerX": 0.0, "centerY": 0.0, "width": 0.0, "height": 0.0, "bottom": 0.0}
    return {
        "centerX": _round(float(target["centerX"]) - float(base["centerX"])),
        "centerY": _round(float(target["centerY"]) - float(base["centerY"])),
        "width": _round(float(target_bounds["width"]) - float(base_bounds["width"])),
        "height": _round(float(target_bounds["height"]) - float(base_bounds["height"])),
        "bottom": _round(float(target_bounds["bottom"]) - float(base_bounds["bottom"])),
    }


def _reference_delta(summary: dict[str, object], reference: dict[str, object] | None) -> dict[str, float]:
    if reference is None:
        return {}
    summary_median = summary["median"]  # type: ignore[index]
    reference_median = reference["median"]  # type: ignore[index]
    summary_first = summary["first"]  # type: ignore[index]
    reference_first = reference["first"]  # type: ignore[index]
    first_delta = _build_delta(reference_first, summary_first)  # type: ignore[arg-type]
    return {
        "firstCenterX": first_delta["centerX"],
        "firstCenterY": first_delta["centerY"],
        "firstBottom": first_delta["bottom"],
        "medianCenterX": _round(float(summary_median["centerX"]) - float(reference_median["centerX"])),  # type: ignore[index]
        "medianCenterY": _round(float(summary_median["centerY"]) - float(reference_median["centerY"])),  # type: ignore[index]
        "medianBottom": _round(float(summary_median["bottom"]) - float(reference_median["bottom"])),  # type: ignore[index]
        "widthRatio": _round(float(summary_median["width"]) / max(1.0, float(reference_median["width"]))),  # type: ignore[index]
        "heightRatio": _round(float(summary_median["height"]) / max(1.0, float(reference_median["height"]))),  # type: ignore[index]
    }


def build_variant_audit(
    animations_root: Path = ANIMATIONS_ROOT,
    *,
    variants: list[str] | None = None,
    frame_folder: str = "transparent_frames",
) -> dict[str, object]:
    """Build an all-variant geometry audit report."""
    variant_names = variants or sorted({
        path.name.split("_", 1)[0]
        for path in animations_root.iterdir()
        if path.is_dir() and "_" in path.name
    })
    report: dict[str, object] = {"variants": {}}
    variant_reports: dict[str, object] = {}
    for variant in variant_names:
        action_dirs = sorted(path for path in animations_root.glob(f"{variant}_*") if path.is_dir())
        summaries = []
        for action_dir in action_dirs:
            if not (action_dir / frame_folder).exists():
                continue
            summaries.append(summarize_action_frames(action_dir, frame_folder))
        reference = next((item for item in summaries if item["action"] == f"{variant}_squat"), None)
        for summary in summaries:
            summary["referenceAction"] = reference["action"] if reference else None  # type: ignore[index]
            summary["referenceDelta"] = _reference_delta(summary, reference)
        variant_reports[variant] = {"referenceAction": f"{variant}_squat" if reference else None, "actions": summaries}
    report["variants"] = variant_reports
    report["risks"] = rank_geometry_risks(report)
    return report


def rank_geometry_risks(report: dict[str, object]) -> list[dict[str, object]]:
    """Return actions sorted by likely transition/grounding risk."""
    risks: list[dict[str, object]] = []
    variants = report.get("variants", {})
    if not isinstance(variants, dict):
        return risks

    for variant, variant_report in variants.items():
        if not isinstance(variant_report, dict):
            continue
        actions = variant_report.get("actions", [])
        if not isinstance(actions, list):
            continue
        for action in actions:
            if not isinstance(action, dict):
                continue
            delta = action.get("referenceDelta", {})
            if not isinstance(delta, dict) or not delta:
                continue
            range_info = action.get("range", {})
            ground_info = action.get("groundAlpha", {})
            canvas_info = action.get("canvas", {})
            if not isinstance(range_info, dict) or not isinstance(ground_info, dict) or not isinstance(canvas_info, dict):
                continue
            score = _risk_score(delta, range_info, ground_info, canvas_info)
            risks.append({
                "variant": variant,
                "action": action.get("action"),
                "score": _round(score),
                "frameCount": action.get("frameCount"),
                "referenceDelta": delta,
                "canvas": canvas_info,
                "range": range_info,
                "groundAlpha": ground_info,
            })
    return sorted(risks, key=lambda item: float(item["score"]), reverse=True)


def _risk_score(
    delta: dict[str, object],
    range_info: dict[str, object],
    ground_info: dict[str, object],
    canvas_info: dict[str, object],
) -> float:
    first_shift = abs(float(delta.get("firstCenterX", 0))) + 0.6 * abs(float(delta.get("firstCenterY", 0)))
    median_shift = abs(float(delta.get("medianCenterX", 0))) + 0.6 * abs(float(delta.get("medianCenterY", 0)))
    scale_delta = max(
        abs(float(delta.get("widthRatio", 1)) - 1),
        abs(float(delta.get("heightRatio", 1)) - 1),
    )
    drift = max(float(range_info.get("centerX", 0)), float(range_info.get("centerY", 0)))
    ground = float(ground_info.get("maxLowRows", 0))
    canvas_shift = abs(float(canvas_info.get("medianCenterDeltaX", 0)))
    margin_imbalance = abs(float(canvas_info.get("medianMarginDeltaX", 0)))
    return first_shift + median_shift + scale_delta * 80 + drift * 0.35 + ground * 0.4 + canvas_shift * 0.5 + margin_imbalance * 0.2


def write_audit_report(report: dict[str, object], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
