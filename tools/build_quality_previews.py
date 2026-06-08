from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont


PROJECT_ROOT = Path(__file__).resolve().parents[1]
TOOLS_ROOT = Path(__file__).resolve().parent
ANIMATIONS_ROOT = PROJECT_ROOT / "assets" / "animations"
OUTPUT_ROOT = PROJECT_ROOT / "quality_previews"
ACTIONS = ("dog_squat", "dog_walk", "dog_feed", "dog_ball")

if str(TOOLS_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLS_ROOT))

from process_pet_videos import (  # noqa: E402
    chroma_key_green_image,
    clear_frame_dir,
    find_ffmpeg,
    get_global_bounds,
)


FRAME_MS = 30
FFMPEG_FPS = "100/3"
PREVIEW_SECONDS = 5
PREVIEW_FRAME_COUNT = round(PREVIEW_SECONDS * 1000 / FRAME_MS)

CURRENT_FRAME_SIZE = 128
DISPLAY_FRAME_SIZE = 256
CANDIDATE_FRAME_SIZE = 256
CANDIDATE_VISIBLE_HEIGHT = 216
CANDIDATE_VISIBLE_MAX_WIDTH = 244
CANDIDATE_GROUND_PADDING = 16


ACTION_LABELS = {
    "dog_squat": "蹲坐",
    "dog_walk": "步行",
    "dog_feed": "喂食",
    "dog_ball": "玩球",
}


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        Path(r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc"),
        Path(r"C:\Windows\Fonts\simhei.ttf"),
        Path(r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


FONT_TITLE = load_font(22, bold=True)
FONT_LABEL = load_font(18, bold=True)
FONT_SMALL = load_font(13)


def read_loop(action_dir: Path) -> dict[str, int | float | str]:
    loop_path = action_dir / "loop.json"
    if not loop_path.exists():
        raise FileNotFoundError(f"Missing loop.json: {loop_path}")
    return json.loads(loop_path.read_text(encoding="utf-8"))


def frame_path(frame_dir: Path, index: int) -> Path:
    path = frame_dir / f"frame_{index:03d}.png"
    if not path.exists():
        raise FileNotFoundError(f"Missing frame: {path}")
    return path


def hard_clean_alpha(image: Image.Image) -> Image.Image:
    pixels = np.array(image.convert("RGBA")).astype(np.float32)
    r = pixels[:, :, 0]
    g = pixels[:, :, 1]
    b = pixels[:, :, 2]
    a = pixels[:, :, 3]
    max_rb = np.maximum(r, b)

    green_edge = (a > 0.0) & (g > 42.0) & (g > r * 1.02) & (g > b * 1.02) & ((g - max_rb) > 2.0)
    pixels[:, :, 1] = np.where(green_edge, np.minimum(g, max_rb * 0.86 + 6.0), g)

    alpha = np.where(a < 10.0, 0.0, a)
    alpha = np.where(alpha > 248.0, 255.0, alpha)
    pixels[:, :, 3] = alpha
    pixels[alpha == 0.0, :3] = 0.0
    return Image.fromarray(np.clip(pixels, 0.0, 255.0).astype(np.uint8), "RGBA")


def enhance_rgba(image: Image.Image) -> Image.Image:
    image = hard_clean_alpha(image)
    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    rgb = ImageEnhance.Contrast(rgb).enhance(1.035)
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.08)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=0.65, percent=70, threshold=4))
    output = rgb.convert("RGBA")
    output.putalpha(alpha)
    return hard_clean_alpha(output)


def normalize_candidate_frame(
    image: Image.Image,
    bounds: tuple[int, int, int, int],
    visible_height: int = CANDIDATE_VISIBLE_HEIGHT,
    visible_max_width: int = CANDIDATE_VISIBLE_MAX_WIDTH,
) -> Image.Image:
    left, top, right, bottom = bounds
    cropped = image.crop((left, top, right, bottom))
    width, height = cropped.size
    scale = min(visible_height / height, visible_max_width / width)
    target_width = max(1, round(width * scale))
    target_height = max(1, round(height * scale))
    resized = cropped.resize((target_width, target_height), Image.Resampling.LANCZOS)
    resized = enhance_rgba(resized)

    output = Image.new("RGBA", (CANDIDATE_FRAME_SIZE, CANDIDATE_FRAME_SIZE), (0, 0, 0, 0))
    x = (CANDIDATE_FRAME_SIZE - target_width) // 2
    y = CANDIDATE_FRAME_SIZE - CANDIDATE_GROUND_PADDING - target_height
    output.alpha_composite(resized, (x, y))
    return hard_clean_alpha(output)


def generate_candidate_frames(action: str, action_dir: Path, output_dir: Path) -> list[Path]:
    raw_dir = action_dir / "raw_frames"
    raw_frames = sorted(raw_dir.glob("frame_*.png"))
    if not raw_frames:
        raise RuntimeError(f"No raw frames found: {raw_dir}")

    candidate_dir = output_dir / "enhanced_frames_2x"
    clear_frame_dir(candidate_dir)
    bounds = get_global_bounds(raw_frames)

    loop = read_loop(action_dir)
    loop_start = int(loop["loopStart"])
    loop_end = int(loop["loopEnd"])
    candidate_frames: list[Path] = []
    for index in range(loop_start, loop_end + 1):
        keyed = chroma_key_green_image(frame_path(raw_dir, index))
        output_path = candidate_dir / f"frame_{index:03d}.png"
        normalize_candidate_frame(keyed, bounds).save(output_path)
        candidate_frames.append(output_path)

    return candidate_frames


def make_checkerboard(size: tuple[int, int], cell: int = 16) -> Image.Image:
    width, height = size
    image = Image.new("RGB", size, "#eee9df")
    draw = ImageDraw.Draw(image)
    for y in range(0, height, cell):
        for x in range(0, width, cell):
            if (x // cell + y // cell) % 2 == 0:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill="#f9f4ea")
    return image


def paste_rgba(canvas: Image.Image, image: Image.Image, xy: tuple[int, int]) -> None:
    canvas.paste(image, xy, image)


def draw_centered(draw: ImageDraw.ImageDraw, text: str, x: int, y: int, width: int, font: ImageFont.ImageFont, fill: str) -> None:
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    draw.text((x + (width - text_width) // 2, y), text, font=font, fill=fill)


def render_single_preview_frame(
    frame_path_value: Path,
    label: str,
    action_label: str,
    frame_number: int,
    native_size: int,
) -> Image.Image:
    canvas = make_checkerboard((420, 360))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((18, 18, 402, 342), radius=18, fill="#fffaf2", outline="#dfd4c6", width=2)
    draw_centered(draw, f"{action_label} | {label}", 18, 32, 384, FONT_TITLE, "#453526")
    pet = Image.open(frame_path_value).convert("RGBA")
    if pet.size != (DISPLAY_FRAME_SIZE, DISPLAY_FRAME_SIZE):
        pet = pet.resize((DISPLAY_FRAME_SIZE, DISPLAY_FRAME_SIZE), Image.Resampling.LANCZOS)
    paste_rgba(canvas, pet, (82, 72))
    draw_centered(draw, f"frame {frame_number:03d} | native {native_size}px", 18, 318, 384, FONT_SMALL, "#756454")
    return canvas


def render_compare_frame(
    current_path: Path,
    candidate_path: Path,
    action_label: str,
    source_frame: int,
) -> Image.Image:
    canvas = make_checkerboard((820, 390))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((20, 18, 394, 366), radius=18, fill="#fffaf2", outline="#dfd4c6", width=2)
    draw.rounded_rectangle((426, 18, 800, 366), radius=18, fill="#fffaf2", outline="#dfd4c6", width=2)
    draw_centered(draw, f"{action_label} | 当前版", 20, 34, 374, FONT_LABEL, "#453526")
    draw_centered(draw, f"{action_label} | 增强候选 2x", 426, 34, 374, FONT_LABEL, "#453526")

    current = Image.open(current_path).convert("RGBA")
    current = current.resize((DISPLAY_FRAME_SIZE, DISPLAY_FRAME_SIZE), Image.Resampling.LANCZOS)
    candidate = Image.open(candidate_path).convert("RGBA")
    if candidate.size != (DISPLAY_FRAME_SIZE, DISPLAY_FRAME_SIZE):
        candidate = candidate.resize((DISPLAY_FRAME_SIZE, DISPLAY_FRAME_SIZE), Image.Resampling.LANCZOS)

    paste_rgba(canvas, current, (79, 74))
    paste_rgba(canvas, candidate, (485, 74))
    draw_centered(draw, "128px 运行资源放大预览", 20, 330, 374, FONT_SMALL, "#756454")
    draw_centered(draw, f"256px 候选资源 | source frame {source_frame:03d}", 426, 330, 374, FONT_SMALL, "#756454")
    return canvas


def clear_png_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    for item in path.glob("*.png"):
        item.unlink()


def write_preview_pngs(action: str, action_dir: Path, output_dir: Path) -> tuple[Path, Path, Path]:
    loop = read_loop(action_dir)
    loop_start = int(loop["loopStart"])
    loop_end = int(loop["loopEnd"])
    loop_length = loop_end - loop_start + 1
    if loop_length <= 0:
        raise RuntimeError(f"Invalid loop for {action}: {loop_start}..{loop_end}")

    current_dir = action_dir / "transparent_frames"
    candidate_dir = output_dir / "enhanced_frames_2x"
    current_preview_frames = output_dir / "preview_frames_current"
    candidate_preview_frames = output_dir / "preview_frames_enhanced"
    compare_preview_frames = output_dir / "preview_frames_compare"
    for path in (current_preview_frames, candidate_preview_frames, compare_preview_frames):
        clear_png_dir(path)

    action_label = ACTION_LABELS.get(action, action)
    for preview_index in range(PREVIEW_FRAME_COUNT):
        source_index = loop_start + (preview_index % loop_length)
        current_path = frame_path(current_dir, source_index)
        candidate_path = frame_path(candidate_dir, source_index)

        current = render_single_preview_frame(current_path, "当前版", action_label, source_index, CURRENT_FRAME_SIZE)
        candidate = render_single_preview_frame(candidate_path, "增强候选 2x", action_label, source_index, CANDIDATE_FRAME_SIZE)
        compare = render_compare_frame(current_path, candidate_path, action_label, source_index)

        current.save(current_preview_frames / f"preview_{preview_index:04d}.png")
        candidate.save(candidate_preview_frames / f"preview_{preview_index:04d}.png")
        compare.save(compare_preview_frames / f"preview_{preview_index:04d}.png")

    return current_preview_frames, candidate_preview_frames, compare_preview_frames


def encode_video(ffmpeg: str, frames_dir: Path, output_path: Path) -> None:
    pattern = frames_dir / "preview_%04d.png"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()

    attempts = [
        [ffmpeg, "-hide_banner", "-y", "-framerate", FFMPEG_FPS, "-i", str(pattern), "-pix_fmt", "yuv420p", "-c:v", "h264_mf", "-b:v", "8M", str(output_path)],
        [ffmpeg, "-hide_banner", "-y", "-framerate", FFMPEG_FPS, "-i", str(pattern), "-pix_fmt", "yuv420p", "-c:v", "mpeg4", "-q:v", "3", str(output_path)],
    ]
    errors: list[str] = []
    for command in attempts:
        result = subprocess.run(command, text=True, capture_output=True)
        if result.returncode == 0 and output_path.exists():
            return
        errors.append(result.stderr.strip())

    raise RuntimeError(f"Could not encode {output_path}\n" + "\n\n".join(errors))


def write_report(results: list[dict[str, object]]) -> Path:
    report_path = OUTPUT_ROOT / "README.md"
    lines = [
        "# PawPal Quality Preview",
        "",
        "这些文件用于比较当前 128px 运行资源与保守增强后的 256px 候选资源。",
        "当前程序资源没有被替换；确认效果更好后，再把候选资源接入正式动画。",
        "",
        "| 动作 | 循环段 | 当前版预览 | 增强候选预览 | 并排对比 |",
        "| --- | --- | --- | --- | --- |",
    ]
    for result in results:
        action = str(result["action"])
        label = ACTION_LABELS.get(action, action)
        loop_range = f"{result['loopStart']}..{result['loopEnd']}"
        action_dir = f"./{action}"
        lines.append(
            f"| {label} | {loop_range} | [{action}_current_5s.mp4]({action_dir}/{action}_current_5s.mp4) "
            f"| [{action}_enhanced_2x_5s.mp4]({action_dir}/{action}_enhanced_2x_5s.mp4) "
            f"| [{action}_compare_5s.mp4]({action_dir}/{action}_compare_5s.mp4) |"
        )
    lines.extend(
        [
            "",
            "候选增强策略：从原始抽帧重新抠绿、统一裁切和落地点、输出 2x 透明 PNG、轻微去绿边、轻微对比和锐化。",
            "没有使用逐帧重画或帧间混合，所以不会引入新的动作残影；是否替换正式资源建议以并排视频肉眼检查为准。",
        ]
    )
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return report_path


def process_action(action: str, ffmpeg: str) -> dict[str, object]:
    action_dir = ANIMATIONS_ROOT / action
    if not action_dir.exists():
        raise FileNotFoundError(f"Missing action directory: {action_dir}")

    loop = read_loop(action_dir)
    output_dir = OUTPUT_ROOT / action
    output_dir.mkdir(parents=True, exist_ok=True)
    generate_candidate_frames(action, action_dir, output_dir)
    current_frames, candidate_frames, compare_frames = write_preview_pngs(action, action_dir, output_dir)

    videos = {
        "current": output_dir / f"{action}_current_5s.mp4",
        "enhanced": output_dir / f"{action}_enhanced_2x_5s.mp4",
        "compare": output_dir / f"{action}_compare_5s.mp4",
    }
    encode_video(ffmpeg, current_frames, videos["current"])
    encode_video(ffmpeg, candidate_frames, videos["enhanced"])
    encode_video(ffmpeg, compare_frames, videos["compare"])

    return {
        "action": action,
        "loopStart": int(loop["loopStart"]),
        "loopEnd": int(loop["loopEnd"]),
        "currentVideo": str(videos["current"]),
        "enhancedVideo": str(videos["enhanced"]),
        "compareVideo": str(videos["compare"]),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build conservative 2x pet-quality candidates and 5s comparison videos.")
    parser.add_argument("--actions", nargs="*", default=list(ACTIONS), help="Action folder names to preview.")
    parser.add_argument("--ffmpeg", default=None, help="Path to ffmpeg.exe.")
    parser.add_argument("--clean", action="store_true", help="Clear the whole quality preview output folder first.")
    args = parser.parse_args()

    ffmpeg = find_ffmpeg(args.ffmpeg)
    if args.clean and OUTPUT_ROOT.exists():
        shutil.rmtree(OUTPUT_ROOT)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    print(f"Using ffmpeg: {ffmpeg}")
    results = []
    for action in args.actions:
        print(f"\n[{action}] building quality previews")
        result = process_action(action, ffmpeg)
        results.append(result)
        print(f"[{action}] compare: {result['compareVideo']}")

    report_path = write_report(results)
    print(f"\nWrote report: {report_path}")


if __name__ == "__main__":
    main()
