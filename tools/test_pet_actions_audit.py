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
            pixels[x, y] = (120, 80, 60, alpha)
    image.save(path)


class PetActionAuditTests(unittest.TestCase):
    def test_summarize_action_frames_reports_geometry_and_ground_alpha(self) -> None:
        from pet_actions.audit import summarize_action_frames

        with tempfile.TemporaryDirectory() as tmp:
            frame_dir = Path(tmp) / "tabby_squat" / "transparent_frames"
            frame_dir.mkdir(parents=True)
            make_frame(frame_dir / "frame_000.png", (8, 6, 15, 20))
            make_frame(frame_dir / "frame_001.png", (10, 7, 17, 20))

            # Low-alpha ground residue should be reported below the solid body.
            image = Image.open(frame_dir / "frame_001.png").convert("RGBA")
            pixels = image.load()
            for y in range(21, 24):
                for x in range(0, 32):
                    pixels[x, y] = (20, 20, 20, 24)
            image.save(frame_dir / "frame_001.png")

            image = Image.open(frame_dir / "frame_000.png").convert("RGBA")
            pixels = image.load()
            pixels[11, 12] = (0, 0, 0, 0)
            pixels[12, 12] = (0, 0, 0, 0)
            image.save(frame_dir / "frame_000.png")

            summary = summarize_action_frames(frame_dir.parent)

        self.assertEqual(summary["action"], "tabby_squat")
        self.assertEqual(summary["frameCount"], 2)
        self.assertEqual(summary["sizes"], [[32, 32]])
        self.assertEqual(summary["first"]["bounds"]["left"], 8)
        self.assertEqual(summary["first"]["bounds"]["bottom"], 20)
        # Runtime visible bounds use alpha > 12, so low-alpha ground residue can
        # inflate geometry until the safe trim pass removes it.
        self.assertAlmostEqual(summary["median"]["centerX"], 14.0)
        self.assertAlmostEqual(summary["canvas"]["medianCenterDeltaX"], -2.0)
        self.assertEqual(summary["canvas"]["medianMarginDeltaX"], -4.0)
        self.assertEqual(summary["range"]["centerX"], 4.0)
        self.assertEqual(summary["groundAlpha"]["maxLowRows"], 3)
        self.assertEqual(summary["groundAlpha"]["framesWithLowRows"], 1)
        self.assertEqual(summary["interiorAlphaHoles"]["maxPixels"], 2)
        self.assertEqual(summary["interiorAlphaHoles"]["framesWithHoles"], 1)
        self.assertGreater(summary["denseLowAlphaCracks"]["maxPixels"], 0)

    def test_summarize_action_frames_reports_high_alpha_ground_artifacts(self) -> None:
        from pet_actions.audit import summarize_action_frames

        with tempfile.TemporaryDirectory() as tmp:
            frame_dir = Path(tmp) / "tabby_ball" / "transparent_frames"
            frame_dir.mkdir(parents=True)
            make_frame(frame_dir / "frame_000.png", (8, 6, 20, 22), size=(40, 40))

            image = Image.open(frame_dir / "frame_000.png").convert("RGBA")
            pixels = image.load()
            for y in range(34, 37):
                for x in range(31, 34):
                    pixels[x, y] = (20, 20, 20, 194)
            image.save(frame_dir / "frame_000.png")

            summary = summarize_action_frames(frame_dir.parent)

        self.assertEqual(summary["groundArtifacts"]["maxStrayComponents"], 1)
        self.assertEqual(summary["groundArtifacts"]["maxStrayPixels"], 9)
        self.assertEqual(summary["groundArtifacts"]["framesWithStray"], 1)

    def test_build_variant_audit_compares_actions_to_squat_and_ranks_risks(self) -> None:
        from pet_actions.audit import build_variant_audit, rank_geometry_risks

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            squat = root / "tabby_squat" / "transparent_frames"
            shifted = root / "tabby_shake" / "transparent_frames"
            squat.mkdir(parents=True)
            shifted.mkdir(parents=True)
            make_frame(squat / "frame_000.png", (8, 6, 15, 20))
            make_frame(squat / "frame_001.png", (8, 6, 15, 20))
            make_frame(shifted / "frame_000.png", (20, 6, 27, 20))
            make_frame(shifted / "frame_001.png", (22, 6, 29, 20))

            report = build_variant_audit(root, variants=["tabby"])
            risks = rank_geometry_risks(report)

        tabby_actions = {item["action"]: item for item in report["variants"]["tabby"]["actions"]}
        self.assertEqual(tabby_actions["tabby_shake"]["referenceDelta"]["medianCenterX"], 13.0)
        self.assertEqual(risks[0]["canvas"]["maxAbsCenterDeltaX"], 10.0)
        self.assertEqual(risks[0]["action"], "tabby_shake")
        self.assertGreater(risks[0]["score"], risks[-1]["score"])


if __name__ == "__main__":
    unittest.main()
