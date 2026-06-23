const test = require("node:test");
const assert = require("node:assert/strict");

// 测试 overlay-geometry.cjs 的纯几何函数
// 这些函数不依赖 Electron screen，可以独立测试

function createTestGeometry() {
  // 复制 overlay-geometry.cjs 中的纯函数进行测试
  const { clamp, expandRect, rectsOverlap, rectFitsInArea, getRectClosestEdgeDistance, getRectCenterDistance, cloneRect } = require("../electron/shared/bounds.cjs");

  // 复制 clampPanelRect 实现
  function clampPanelRect(rect, area, width = rect.width, height = rect.height) {
    const maxX = area.x + Math.max(0, area.width - width);
    const maxY = area.y + Math.max(0, area.height - height);
    return {
      x: clamp(Math.round(rect.x), area.x, maxX),
      y: clamp(Math.round(rect.y), area.y, maxY),
      width,
      height
    };
  }

  // 复制 pickBestOverlayCandidate 实现
  function pickBestOverlayCandidate(entries, preferredRect, safeArea, rawArea, minEdgeGap = 8) {
    if (!entries || entries.length === 0) {
      return null;
    }
    return entries
      .map((entry) => {
        const centerDistance = getRectCenterDistance(entry.rect, preferredRect);
        const edgeDistance = getRectClosestEdgeDistance(entry.rect, rawArea);
        const edgePenalty = edgeDistance < minEdgeGap ? (minEdgeGap - edgeDistance) * 16 : 0;
        const clampPenalty = Math.max(0, entry.shift || 0) * 10;
        const safeAreaPenalty = rectFitsInArea(entry.rect, safeArea) ? 0 : 1200;
        return {
          rect: entry.rect,
          score: clampPenalty + centerDistance + edgePenalty + safeAreaPenalty
        };
      })
      .sort((a, b) => a.score - b.score)[0].rect;
  }

  // 复制 getOverlaySafeArea 实现
  const OVERLAY_BASE_GAP = 12;
  function getOverlaySafeArea(area, referenceGap = OVERLAY_BASE_GAP) {
    const inset = clamp(Math.round(Math.max(8, referenceGap * 0.55)), 8, 18);
    if (area.width <= inset * 2 + 40 || area.height <= inset * 2 + 40) {
      return area;
    }
    return {
      x: area.x + inset,
      y: area.y + inset,
      width: Math.max(1, area.width - inset * 2),
      height: Math.max(1, area.height - inset * 2)
    };
  }

  // 复制 getMenuPlacementArea 实现
  function getMenuPlacementArea(area, surface, edgeGap) {
    const safeGap = Math.max(0, Math.round(edgeGap));
    const isWindowSurface = surface?.type === "window";
    const inset = {
      left: safeGap,
      right: safeGap,
      top: safeGap,
      bottom: isWindowSurface ? safeGap : Math.max(safeGap, safeGap + 4)
    };
    const width = Math.max(1, area.width - inset.left - inset.right);
    const height = Math.max(1, area.height - inset.top - inset.bottom);
    if (width <= 36 || height <= 36) {
      return area;
    }
    return {
      x: area.x + inset.left,
      y: area.y + inset.top,
      width,
      height
    };
  }

  // 复制 getMenuCandidateGaps 实现
  function getMenuCandidateGaps(rect, kind, petRect) {
    const horizontalGap = kind.startsWith("right")
      ? rect.x - (petRect.x + petRect.width)
      : petRect.x - (rect.x + rect.width);
    const verticalGap = kind.endsWith("up")
      ? petRect.y - (rect.y + rect.height)
      : rect.y - (petRect.y + petRect.height);
    return {
      horizontal: Math.round(horizontalGap),
      vertical: Math.round(verticalGap)
    };
  }

  return { clampPanelRect, pickBestOverlayCandidate, getOverlaySafeArea, getMenuPlacementArea, getMenuCandidateGaps };
}

const geometry = createTestGeometry();

test("clampPanelRect clamps rect within area", () => {
  const area = { x: 0, y: 0, width: 800, height: 600 };
  const result = geometry.clampPanelRect({ x: -10, y: -20, width: 100, height: 50 }, area);
  assert.equal(result.x, 0);
  assert.equal(result.y, 0);
  assert.equal(result.width, 100);
  assert.equal(result.height, 50);
});

test("clampPanelRect allows rect within area", () => {
  const area = { x: 0, y: 0, width: 800, height: 600 };
  const result = geometry.clampPanelRect({ x: 100, y: 200, width: 100, height: 50 }, area);
  assert.equal(result.x, 100);
  assert.equal(result.y, 200);
});

test("clampPanelRect clamps to max position", () => {
  const area = { x: 0, y: 0, width: 800, height: 600 };
  const result = geometry.clampPanelRect({ x: 1000, y: 1000, width: 100, height: 50 }, area);
  assert.equal(result.x, 700);
  assert.equal(result.y, 550);
});

test("pickBestOverlayCandidate returns null for empty entries", () => {
  const result = geometry.pickBestOverlayCandidate([], { x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 100, height: 100 }, { x: 0, y: 0, width: 100, height: 100 });
  assert.equal(result, null);
});

test("pickBestOverlayCandidate picks closest to preferred", () => {
  const safeArea = { x: 0, y: 0, width: 800, height: 600 };
  const rawArea = { x: 0, y: 0, width: 800, height: 600 };
  const preferred = { x: 100, y: 100, width: 50, height: 50 };
  const entries = [
    { rect: { x: 300, y: 300, width: 50, height: 50 }, shift: 0 },
    { rect: { x: 110, y: 110, width: 50, height: 50 }, shift: 0 }
  ];
  const result = geometry.pickBestOverlayCandidate(entries, preferred, safeArea, rawArea);
  assert.equal(result.x, 110);
  assert.equal(result.y, 110);
});

test("getOverlaySafeArea insets area by gap", () => {
  const area = { x: 0, y: 0, width: 800, height: 600 };
  const result = geometry.getOverlaySafeArea(area, 12);
  assert.equal(result.x, 8);
  assert.equal(result.y, 8);
  assert.equal(result.width, 784);
  assert.equal(result.height, 584);
});

test("getOverlaySafeArea returns original area for small areas", () => {
  const area = { x: 0, y: 0, width: 50, height: 50 };
  const result = geometry.getOverlaySafeArea(area, 12);
  assert.deepEqual(result, area);
});

test("getMenuPlacementArea insets area with bottom padding for non-window surface", () => {
  const area = { x: 0, y: 0, width: 800, height: 600 };
  const result = geometry.getMenuPlacementArea(area, { type: "taskbar" }, 10);
  assert.equal(result.x, 10);
  assert.equal(result.y, 10);
  assert.equal(result.width, 780);
  assert.equal(result.height, 576); // 600 - 10 - 14
});

test("getMenuPlacementArea insets area equally for window surface", () => {
  const area = { x: 0, y: 0, width: 800, height: 600 };
  const result = geometry.getMenuPlacementArea(area, { type: "window" }, 10);
  assert.equal(result.x, 10);
  assert.equal(result.y, 10);
  assert.equal(result.width, 780);
  assert.equal(result.height, 580);
});

test("getMenuPlacementArea returns original area for small areas", () => {
  const area = { x: 0, y: 0, width: 50, height: 50 };
  const result = geometry.getMenuPlacementArea(area, { type: "window" }, 10);
  assert.deepEqual(result, area);
});

test("getMenuCandidateGaps computes right-up gaps", () => {
  const rect = { x: 200, y: 100, width: 50, height: 50 };
  const petRect = { x: 100, y: 200, width: 50, height: 50 };
  const result = geometry.getMenuCandidateGaps(rect, "right-up", petRect);
  assert.equal(result.horizontal, 50); // 200 - (100+50)
  assert.equal(result.vertical, 50); // 200 - (100+50)
});

test("getMenuCandidateGaps computes left-down gaps", () => {
  const rect = { x: 50, y: 300, width: 50, height: 50 };
  const petRect = { x: 100, y: 200, width: 50, height: 50 };
  const result = geometry.getMenuCandidateGaps(rect, "left-down", petRect);
  assert.equal(result.horizontal, 0); // 100 - (50+50)
  assert.equal(result.vertical, 50); // 300 - (200+50)
});
