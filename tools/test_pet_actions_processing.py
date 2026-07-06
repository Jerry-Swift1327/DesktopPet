from __future__ import annotations

import sys
import tempfile
import unittest
import argparse
import contextlib
import io
from pathlib import Path

import numpy as np
from PIL import Image

TOOLS_ROOT = Path(__file__).resolve().parent
if str(TOOLS_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLS_ROOT))


def make_frame(path: Path, box: tuple[int, int, int, int], alpha: int = 255, size: tuple[int, int] = (32, 32)) -> None:
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    pixels = image.load()
    left, top, right, bottom = box
    for y in range(top, bottom + 1):
        for x in range(left, right + 1):
            pixels[x, y] = (160, 100, 80, alpha)
    image.save(path)


def make_green_frame(path: Path, box: tuple[int, int, int, int], size: tuple[int, int] = (32, 32)) -> None:
    image = Image.new("RGBA", size, (0, 255, 0, 255))
    pixels = image.load()
    left, top, right, bottom = box
    for y in range(top, bottom + 1):
        for x in range(left, right + 1):
            pixels[x, y] = (160, 100, 80, 255)
    image.save(path)


class PetActionProcessingTests(unittest.TestCase):
    def run_fake_action_processing(self, *, clean_raw: bool = False, keep_raw: bool = False) -> bool:
        import process_pet_actions as cli

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            animations_root = tmp_path / "animations"
            action_dir = animations_root / "test_squat"
            action_dir.mkdir(parents=True)
            video_path = tmp_path / "source.mp4"
            video_path.write_bytes(b"fake video")

            original_root = cli.ANIMATIONS_ROOT
            original_extract = cli.extract_frames
            original_process = cli.process_frames_to_processed
            try:
                cli.ANIMATIONS_ROOT = animations_root

                def fake_extract_frames(_ffmpeg, _video_path, raw_dir, _fps):
                    raw_dir.mkdir(parents=True, exist_ok=True)
                    make_green_frame(raw_dir / "frame_000.png", (8, 8, 15, 15))

                def fake_process_frames_to_processed(raw_dir, processed_dir, *args, **kwargs):
                    processed_dir.mkdir(parents=True, exist_ok=True)
                    make_frame(processed_dir / "frame_000.png", (8, 8, 15, 15))
                    return [processed_dir / "frame_000.png"], {"normalizationMode": "source-canvas"}

                cli.extract_frames = fake_extract_frames
                cli.process_frames_to_processed = fake_process_frames_to_processed
                cli.process_action_core(
                    action="test_squat",
                    ffmpeg="ffmpeg",
                    fps="1",
                    video_path=video_path,
                    no_loop=True,
                    keep_raw=keep_raw,
                    clean_raw=clean_raw,
                )
                return (action_dir / "raw_frames" / "frame_000.png").exists()
            finally:
                cli.ANIMATIONS_ROOT = original_root
                cli.extract_frames = original_extract
                cli.process_frames_to_processed = original_process

    def test_process_action_core_keeps_raw_frames_by_default(self) -> None:
        raw_frame_exists = self.run_fake_action_processing()

        self.assertTrue(raw_frame_exists)

    def test_process_action_core_clean_raw_removes_raw_frames(self) -> None:
        raw_frame_exists = self.run_fake_action_processing(clean_raw=True)

        self.assertFalse(raw_frame_exists)

    def test_raw_frame_cli_flags_are_compatible_and_mutually_exclusive(self) -> None:
        from process_pet_actions import add_common_args

        parser = argparse.ArgumentParser()
        add_common_args(parser)

        keep_args = parser.parse_args(["--keep-raw"])
        clean_args = parser.parse_args(["--clean-raw"])

        self.assertTrue(keep_args.keep_raw)
        self.assertFalse(keep_args.clean_raw)
        self.assertTrue(clean_args.clean_raw)
        self.assertFalse(clean_args.keep_raw)
        with self.assertRaises(SystemExit):
            with contextlib.redirect_stderr(io.StringIO()):
                parser.parse_args(["--keep-raw", "--clean-raw"])

    def test_trim_ground_alpha_remnants_auto_clears_only_low_alpha_tail(self) -> None:
        from pet_actions.chroma import trim_ground_alpha_remnants_auto

        image = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
        pixels = image.load()
        for y in range(8, 18):
            for x in range(8, 16):
                pixels[x, y] = (120, 80, 60, 255)
        for y in range(18, 22):
            for x in range(0, 24):
                pixels[x, y] = (20, 20, 20, 24)

        cleaned, info = trim_ground_alpha_remnants_auto(image, enabled=True, solid_threshold=128, low_alpha_threshold=48, row_padding=0)
        alpha = cleaned.getchannel("A")

        self.assertEqual(info["applied"], True)
        self.assertEqual(info["lowRows"], 4)
        self.assertEqual(alpha.getpixel((12, 17)), 255)
        self.assertEqual(alpha.getpixel((12, 18)), 0)

    def test_trim_ground_alpha_remnants_auto_skips_solid_tail(self) -> None:
        from pet_actions.chroma import trim_ground_alpha_remnants_auto

        image = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
        pixels = image.load()
        for y in range(8, 22):
            for x in range(8, 16):
                pixels[x, y] = (120, 80, 60, 255)

        cleaned, info = trim_ground_alpha_remnants_auto(image, enabled=True, solid_threshold=128, low_alpha_threshold=48, row_padding=0)

        self.assertEqual(info["applied"], False)
        self.assertEqual(cleaned.getchannel("A").getpixel((12, 21)), 255)

    def test_stabilize_ground_removes_bottom_stray_components_and_aligns_subject(self) -> None:
        from pet_actions.chroma import get_frame_geometry, stabilize_frames_to_ground

        first = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        second = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        first_pixels = first.load()
        second_pixels = second.load()
        for y in range(18, 46):
            for x in range(18, 42):
                first_pixels[x, y] = (120, 80, 60, 255)
        for y in range(19, 47):
            for x in range(18, 42):
                second_pixels[x, y] = (120, 80, 60, 255)

        # High-alpha detached residue below the pet should not define ground.
        for y in range(58, 61):
            for x in range(54, 57):
                first_pixels[x, y] = (30, 30, 30, 194)

        stabilized, info = stabilize_frames_to_ground(
            [("frame_000.png", first), ("frame_001.png", second)],
            enabled=True,
            max_shift=8,
        )
        first_geometry = get_frame_geometry(stabilized[0][1])
        second_geometry = get_frame_geometry(stabilized[1][1])
        first_alpha = stabilized[0][1].getchannel("A")

        self.assertEqual(info["applied"], True)
        self.assertEqual(info["cleanedComponents"], 1)
        self.assertEqual(info["cleanedPixels"], 9)
        self.assertEqual(first_alpha.getpixel((55, 59)), 0)
        self.assertEqual(first_geometry["bottom"], second_geometry["bottom"])
        self.assertEqual(first_geometry["bottom"], info["targetBottom"])

    def test_stabilize_ground_keeps_large_detached_foreground_as_warning(self) -> None:
        from pet_actions.chroma import stabilize_frames_to_ground

        image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        pixels = image.load()
        for y in range(18, 46):
            for x in range(18, 42):
                pixels[x, y] = (120, 80, 60, 255)
        for y in range(50, 61):
            for x in range(8, 28):
                pixels[x, y] = (80, 70, 60, 220)

        stabilized, info = stabilize_frames_to_ground([("frame_000.png", image)], enabled=True)

        self.assertEqual(stabilized[0][1].getchannel("A").getpixel((12, 55)), 220)
        self.assertEqual(info["cleanedComponents"], 0)
        self.assertGreater(info["warningCount"], 0)

    def test_stabilize_alpha_mask_repairs_enclosed_pinhole_without_expanding_edge(self) -> None:
        from pet_actions.chroma import detect_interior_alpha_holes, stabilize_alpha_mask_pixels

        image = Image.new("RGBA", (24, 24), (0, 0, 0, 0))
        pixels = image.load()
        for y in range(6, 18):
            for x in range(6, 18):
                pixels[x, y] = (220, 216, 210, 255)
        pixels[11, 11] = (0, 0, 0, 0)
        pixels[12, 11] = (0, 0, 0, 0)

        repaired_pixels, info = stabilize_alpha_mask_pixels(np.array(image).astype(np.float32))
        repaired = Image.fromarray(np.clip(repaired_pixels, 0, 255).astype("uint8"), "RGBA")

        self.assertEqual(info["components"], 1)
        self.assertEqual(info["pixels"], 2)
        self.assertEqual(repaired.getchannel("A").getpixel((11, 11)), 255)
        self.assertEqual(repaired.getchannel("A").getpixel((0, 0)), 0)
        self.assertEqual(detect_interior_alpha_holes(repaired)["pixels"], 0)

    def test_repair_dense_low_alpha_cracks_keeps_open_background_transparent(self) -> None:
        from pet_actions.chroma import detect_dense_low_alpha_cracks, repair_dense_low_alpha_cracks

        image = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        pixels = image.load()
        for y in range(8, 24):
            for x in range(8, 24):
                pixels[x, y] = (220, 216, 210, 255)
        for y in range(10, 22):
            pixels[15, y] = (0, 0, 0, 0)

        self.assertGreater(detect_dense_low_alpha_cracks(image)["pixels"], 0)
        repaired_pixels, info = repair_dense_low_alpha_cracks(np.array(image).astype(np.float32), iterations=3)
        repaired = Image.fromarray(np.clip(repaired_pixels, 0, 255).astype("uint8"), "RGBA")

        self.assertGreater(info["pixels"], 0)
        self.assertEqual(detect_dense_low_alpha_cracks(repaired)["pixels"], 0)
        self.assertEqual(repaired.getchannel("A").getpixel((15, 15)), 255)
        self.assertEqual(repaired.getchannel("A").getpixel((0, 0)), 0)

    def test_align_frame_to_reference_translates_visible_center_and_ground(self) -> None:
        from pet_actions.chroma import align_frame_to_reference, get_frame_geometry

        frame = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        pixels = frame.load()
        for y in range(5, 15):
            for x in range(4, 12):
                pixels[x, y] = (120, 80, 60, 255)

        reference = {
            "centerX": 18.0,
            "bottom": 24,
        }
        aligned, info = align_frame_to_reference(frame, reference, align_center_x=True, align_bottom=True)
        geometry = get_frame_geometry(aligned)

        self.assertEqual(info["dx"], 10)
        self.assertEqual(info["dy"], 10)
        self.assertAlmostEqual(geometry["centerX"], 18.0)
        self.assertEqual(geometry["bottom"], 24)

    def test_resolve_align_reference_action_defaults_to_variant_squat_when_alignment_enabled(self) -> None:
        from process_pet_actions import resolve_align_reference_action

        self.assertEqual(resolve_align_reference_action(None, "tabby", "tabby_shake", True, False), "tabby_squat")
        self.assertEqual(resolve_align_reference_action(None, None, "van_feed", False, True), "van_squat")
        self.assertEqual(resolve_align_reference_action("custom_ref", "tabby", "tabby_shake", True, True), "custom_ref")
        self.assertIsNone(resolve_align_reference_action(None, "tabby", "tabby_shake", False, False))

    def test_translate_frame_applies_uniform_delta_without_recomputing_each_frame(self) -> None:
        from pet_actions.chroma import get_frame_geometry, translate_frame

        first = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        second = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        first_pixels = first.load()
        second_pixels = second.load()
        for y in range(5, 15):
            for x in range(4, 12):
                first_pixels[x, y] = (120, 80, 60, 255)
        for y in range(5, 15):
            for x in range(8, 16):
                second_pixels[x, y] = (120, 80, 60, 255)

        shifted_first = get_frame_geometry(translate_frame(first, 10, 0))
        shifted_second = get_frame_geometry(translate_frame(second, 10, 0))

        self.assertAlmostEqual(shifted_first["centerX"], 18.0)
        self.assertAlmostEqual(shifted_second["centerX"], 22.0)

    def test_center_frames_to_canvas_x_applies_one_action_level_delta(self) -> None:
        from pet_actions.chroma import center_frames_to_canvas_x, get_frame_geometry

        first = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        second = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        first_pixels = first.load()
        second_pixels = second.load()
        for y in range(20, 30):
            for x in range(10, 20):
                first_pixels[x, y] = (120, 80, 60, 255)
        for y in range(20, 30):
            for x in range(20, 30):
                second_pixels[x, y] = (120, 80, 60, 255)

        centered, info = center_frames_to_canvas_x(
            [("frame_000.png", first), ("frame_001.png", second)],
            enabled=True,
            target_x=32.0,
            max_shift=32,
        )
        first_geometry = get_frame_geometry(centered[0][1])
        second_geometry = get_frame_geometry(centered[1][1])

        self.assertEqual(info["applied"], True)
        self.assertEqual(info["dx"], 12)
        self.assertAlmostEqual(first_geometry["centerX"], 27.0)
        self.assertAlmostEqual(second_geometry["centerX"], 37.0)

    def test_processed_frames_default_to_source_canvas_layout(self) -> None:
        from pet_actions.chroma import get_frame_geometry, process_frames_to_processed

        with tempfile.TemporaryDirectory() as tmp:
            raw_dir = Path(tmp) / "raw_frames"
            processed_dir = Path(tmp) / "processed_frames"
            raw_dir.mkdir()
            make_green_frame(raw_dir / "frame_000.png", (3, 8, 10, 23))

            processed_frames, info = process_frames_to_processed(raw_dir, processed_dir)
            geometry = get_frame_geometry(Image.open(processed_frames[0]).convert("RGBA"))

        self.assertEqual(info["normalizationMode"], "source-canvas")
        self.assertEqual(info["sourceCanvasSize"], [32, 32])
        self.assertLess(geometry["centerX"], 90.0)

    def test_processed_frames_keep_crop_mode_for_legacy_layout(self) -> None:
        from pet_actions.chroma import get_frame_geometry, process_frames_to_processed

        with tempfile.TemporaryDirectory() as tmp:
            raw_dir = Path(tmp) / "raw_frames"
            processed_dir = Path(tmp) / "processed_frames"
            raw_dir.mkdir()
            make_green_frame(raw_dir / "frame_000.png", (3, 8, 10, 23))

            processed_frames, info = process_frames_to_processed(raw_dir, processed_dir, normalization_mode="crop")
            geometry = get_frame_geometry(Image.open(processed_frames[0]).convert("RGBA"))

        self.assertEqual(info["normalizationMode"], "crop")
        self.assertNotIn("sourceCanvasSize", info)
        self.assertGreater(geometry["centerX"], 108.0)

    def test_source_canvas_mode_rejects_crop_visible_size_overrides(self) -> None:
        from pet_actions.chroma import process_frames_to_processed

        with tempfile.TemporaryDirectory() as tmp:
            raw_dir = Path(tmp) / "raw_frames"
            processed_dir = Path(tmp) / "processed_frames"
            raw_dir.mkdir()
            make_green_frame(raw_dir / "frame_000.png", (3, 8, 10, 23))

            with self.assertRaisesRegex(ValueError, "visible-height"):
                process_frames_to_processed(raw_dir, processed_dir, visible_height=100)


if __name__ == "__main__":
    unittest.main()
