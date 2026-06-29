from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

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


class PetActionProcessingTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
