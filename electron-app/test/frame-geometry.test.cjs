const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const frameGeometry = require("../electron/pet/frame-geometry.cjs");

const source = fs.readFileSync(path.join(__dirname, "..", "electron", "pet", "frame-geometry.cjs"), "utf8");
// 剥离注释后再做字符串检查，避免首行文档性注释（含 "nativeImage" 等）误触断言
const sourceCode = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

// 结构断言
test("frame-geometry 不 require electron/fs/path", () => {
  assert.doesNotMatch(source, /require\("electron"/);
  assert.doesNotMatch(source, /require\("fs"/);
  assert.doesNotMatch(source, /require\("path"/);
});

test("frame-geometry 不引用 nativeImage/窗口/缓存/IPC/bubble", () => {
  const forbidden = ["nativeImage", "petWindow", "menuWindow", "hoverWindow", "safeSend", "broadcastToWindows", "visibleBoundsCache", "headBoundsCache", "framePixelCache"];
  for (const token of forbidden) {
    assert.ok(!sourceCode.includes(token), `不应出现 ${token}`);
  }
});

test("frame-geometry 导出 9 个函数", () => {
  const expected = ["getStableGroundBottom", "combineFrameBoundsList", "applyStableGroundBottomCorrection", "getSpriteRectFromBounds", "getVisibleSpriteInsetsFromBounds", "getVisiblePetRectFromBounds", "getFrameVisibleRectFromBounds", "getBottomAnchorFromVisibleRect", "getFrameVisibleCenterWindowX"];
  for (const fn of expected) {
    assert.equal(typeof frameGeometry[fn], "function", `应导出 ${fn}`);
  }
});

// getStableGroundBottom
test("getStableGroundBottom 空列表返回 0", () => {
  assert.equal(frameGeometry.getStableGroundBottom([]), 0);
});

test("getStableGroundBottom 单元素返回该 bottom", () => {
  assert.equal(frameGeometry.getStableGroundBottom([{ bottom: 5 }]), 5);
});

test("getStableGroundBottom 多元素返回 90 百分位", () => {
  // bottoms=[0..9]，index=min(9, floor(9*0.9))=floor(8.1)=8，返回 bottoms[8]=8
  const list = Array.from({ length: 10 }, (_, i) => ({ bottom: i }));
  assert.equal(frameGeometry.getStableGroundBottom(list), 8);
});

test("getStableGroundBottom 过滤非 finite bottom", () => {
  assert.equal(frameGeometry.getStableGroundBottom([{ bottom: NaN }, { bottom: 3 }]), 3);
});

// combineFrameBoundsList
test("combineFrameBoundsList 空列表返回 null", () => {
  assert.equal(frameGeometry.combineFrameBoundsList([]), null);
});

test("combineFrameBoundsList 全 falsy 元素返回 null", () => {
  assert.equal(frameGeometry.combineFrameBoundsList([null, undefined, null]), null);
});

test("combineFrameBoundsList 单帧合并并计算 width/height", () => {
  const result = frameGeometry.combineFrameBoundsList([
    { left: 1, top: 2, right: 3, bottom: 4, imageWidth: 10, imageHeight: 10 }
  ]);
  assert.deepEqual(result, {
    left: 1, top: 2, right: 3, bottom: 4, imageWidth: 10, imageHeight: 10, width: 3, height: 3
  });
});

test("combineFrameBoundsList 多帧合并取 min/max", () => {
  const result = frameGeometry.combineFrameBoundsList([
    { left: 1, top: 2, right: 3, bottom: 4, imageWidth: 10, imageHeight: 10 },
    { left: 0, top: 5, right: 7, bottom: 8, imageWidth: 15, imageHeight: 12 }
  ]);
  assert.deepEqual(result, {
    left: 0, top: 2, right: 7, bottom: 8, imageWidth: 15, imageHeight: 12, width: 8, height: 7
  });
});

test("combineFrameBoundsList 不修改入参元素", () => {
  const input = [{ left: 1, top: 2, right: 3, bottom: 4, imageWidth: 10, imageHeight: 10 }];
  frameGeometry.combineFrameBoundsList(input);
  assert.equal(input[0].width, undefined);
  assert.equal(input[0].height, undefined);
});

// applyStableGroundBottomCorrection
test("applyStableGroundBottomCorrection combined 为 null 返回 null", () => {
  assert.equal(frameGeometry.applyStableGroundBottomCorrection(null, [], false), null);
});

test("applyStableGroundBottomCorrection moving=false 时不修正 bottom 但重算 width/height", () => {
  const combined = { left: 0, top: 0, right: 10, bottom: 15, width: 11, height: 16, imageWidth: 100, imageHeight: 100 };
  const result = frameGeometry.applyStableGroundBottomCorrection(combined, [{ bottom: 5 }], false);
  assert.equal(result, combined);
  assert.equal(combined.bottom, 15);
  assert.equal(combined.width, 11);
  assert.equal(combined.height, 16);
});

test("applyStableGroundBottomCorrection moving=true 但长度 <= 2 时不修正 bottom", () => {
  const combined = { left: 0, top: 0, right: 10, bottom: 15, width: 11, height: 16, imageWidth: 100, imageHeight: 100 };
  frameGeometry.applyStableGroundBottomCorrection(combined, [{ bottom: 5 }, { bottom: 10 }], true);
  assert.equal(combined.bottom, 15);
});

test("applyStableGroundBottomCorrection moving=true 且长度 > 2 时修正 bottom 为 min(bottom, stableBottom)", () => {
  // stableBottom=8（10 元素 90 百分位）
  const list = Array.from({ length: 10 }, (_, i) => ({ bottom: i }));
  const combined = { left: 0, top: 0, right: 10, bottom: 15, width: 11, height: 16, imageWidth: 100, imageHeight: 100 };
  const result = frameGeometry.applyStableGroundBottomCorrection(combined, list, true);
  assert.equal(result, combined);
  assert.equal(combined.bottom, 8);
  assert.equal(combined.width, 11);
  assert.equal(combined.height, 9);
});

test("applyStableGroundBottomCorrection bottom 低于 stableBottom 时不低于 top", () => {
  // stableBottom=8，combined.bottom=3 → max(top=0, min(3, 8))=3
  const list = Array.from({ length: 10 }, (_, i) => ({ bottom: i }));
  const combined = { left: 0, top: 0, right: 10, bottom: 3, width: 11, height: 4, imageWidth: 100, imageHeight: 100 };
  frameGeometry.applyStableGroundBottomCorrection(combined, list, true);
  assert.equal(combined.bottom, 3);
  assert.equal(combined.height, 4);
});

// getSpriteRectFromBounds
test("getSpriteRectFromBounds 不带 runway 时走 getSpriteLocalXForWindowWidth", () => {
  const bounds = { x: 10, y: 20, width: 200, height: 200 };
  const ctx = {
    spriteSize: 100,
    runwayInfo: null,
    isTaskbarWalkActive: false,
    getSpriteLocalXForWindowWidth: () => 50
  };
  // horizontalInset=50, verticalInset=200-100=100
  assert.deepEqual(frameGeometry.getSpriteRectFromBounds(bounds, ctx), {
    x: 60, y: 120, width: 100, height: 100
  });
});

test("getSpriteRectFromBounds 带 runway 且匹配时使用 spriteOffsetX", () => {
  const bounds = { x: 10, y: 20, width: 200, height: 200 };
  const ctx = {
    spriteSize: 100,
    runwayInfo: { windowWidth: 200, windowHeight: 200, spriteOffsetX: 30 },
    isTaskbarWalkActive: true,
    getSpriteLocalXForWindowWidth: () => 50
  };
  // horizontalInset=max(0, round(30))=30, verticalInset=100
  assert.deepEqual(frameGeometry.getSpriteRectFromBounds(bounds, ctx), {
    x: 40, y: 120, width: 100, height: 100
  });
});

test("getSpriteRectFromBounds runway 存在但 isTaskbarWalkActive=false 走 fallback", () => {
  const bounds = { x: 10, y: 20, width: 200, height: 200 };
  const ctx = {
    spriteSize: 100,
    runwayInfo: { windowWidth: 200, windowHeight: 200, spriteOffsetX: 30 },
    isTaskbarWalkActive: false,
    getSpriteLocalXForWindowWidth: () => 50
  };
  assert.deepEqual(frameGeometry.getSpriteRectFromBounds(bounds, ctx), {
    x: 60, y: 120, width: 100, height: 100
  });
});

test("getSpriteRectFromBounds runway 存在但 bounds 宽不匹配走 fallback", () => {
  const bounds = { x: 10, y: 20, width: 150, height: 200 };
  const ctx = {
    spriteSize: 100,
    runwayInfo: { windowWidth: 200, windowHeight: 200, spriteOffsetX: 30 },
    isTaskbarWalkActive: true,
    getSpriteLocalXForWindowWidth: () => 50
  };
  assert.deepEqual(frameGeometry.getSpriteRectFromBounds(bounds, ctx), {
    x: 60, y: 120, width: 100, height: 100
  });
});

// getVisibleSpriteInsetsFromBounds
test("getVisibleSpriteInsetsFromBounds bounds 为 null 返回全 0 insets", () => {
  assert.deepEqual(frameGeometry.getVisibleSpriteInsetsFromBounds(null, 100, 1, "right"), {
    left: 0, top: 0, right: 0, bottom: 0
  });
});

test("getVisibleSpriteInsetsFromBounds imageWidth/Height 为 0 返回全 0 insets", () => {
  assert.deepEqual(frameGeometry.getVisibleSpriteInsetsFromBounds(
    { left: 5, top: 5, right: 5, bottom: 5, imageWidth: 0, imageHeight: 100 }, 100, 1, "right"
  ), { left: 0, top: 0, right: 0, bottom: 0 });
});

test("getVisibleSpriteInsetsFromBounds 不镜像时按公式计算", () => {
  const result = frameGeometry.getVisibleSpriteInsetsFromBounds(
    { left: 10, top: 20, right: 30, bottom: 40, imageWidth: 100, imageHeight: 100 }, 100, 1, "right"
  );
  // left=10, top=20, right=round((100-1-30)/100*100)=69, bottom=round((100-1-40)/100*100)=59
  assert.deepEqual(result, { left: 10, top: 20, right: 69, bottom: 59 });
});

test("getVisibleSpriteInsetsFromBounds defaultFacing=undefined direction=1 不镜像", () => {
  const result = frameGeometry.getVisibleSpriteInsetsFromBounds(
    { left: 10, top: 20, right: 30, bottom: 40, imageWidth: 100, imageHeight: 100 }, 100, 1, undefined
  );
  assert.deepEqual(result, { left: 10, top: 20, right: 69, bottom: 59 });
});

test("getVisibleSpriteInsetsFromBounds defaultFacing=left direction>0 镜像交换 left/right", () => {
  const result = frameGeometry.getVisibleSpriteInsetsFromBounds(
    { left: 10, top: 20, right: 30, bottom: 40, imageWidth: 100, imageHeight: 100 }, 100, 1, "left"
  );
  // 镜像后 left=原 right=69, right=原 left=10
  assert.deepEqual(result, { left: 69, top: 20, right: 10, bottom: 59 });
});

test("getVisibleSpriteInsetsFromBounds defaultFacing=right direction<0 镜像交换 left/right", () => {
  const result = frameGeometry.getVisibleSpriteInsetsFromBounds(
    { left: 10, top: 20, right: 30, bottom: 40, imageWidth: 100, imageHeight: 100 }, 100, -1, "right"
  );
  assert.deepEqual(result, { left: 69, top: 20, right: 10, bottom: 59 });
});

test("getVisibleSpriteInsetsFromBounds defaultFacing=left direction<0 不镜像", () => {
  const result = frameGeometry.getVisibleSpriteInsetsFromBounds(
    { left: 10, top: 20, right: 30, bottom: 40, imageWidth: 100, imageHeight: 100 }, 100, -1, "left"
  );
  assert.deepEqual(result, { left: 10, top: 20, right: 69, bottom: 59 });
});

// getVisiblePetRectFromBounds
test("getVisiblePetRectFromBounds 正常组合 spriteRect 与 insets", () => {
  assert.deepEqual(frameGeometry.getVisiblePetRectFromBounds(
    { x: 10, y: 20, width: 100, height: 100 },
    { left: 5, top: 10, right: 15, bottom: 20 }
  ), { x: 15, y: 30, width: 80, height: 70 });
});

test("getVisiblePetRectFromBounds insets 超出时 width/height 至少为 1", () => {
  assert.deepEqual(frameGeometry.getVisiblePetRectFromBounds(
    { x: 10, y: 20, width: 100, height: 100 },
    { left: 60, top: 60, right: 60, bottom: 60 }
  ), { x: 70, y: 80, width: 1, height: 1 });
});

// getFrameVisibleRectFromBounds
test("getFrameVisibleRectFromBounds 不镜像时按缩放换算", () => {
  const result = frameGeometry.getFrameVisibleRectFromBounds(
    { left: 10, top: 20, right: 30, bottom: 40, imageWidth: 100, imageHeight: 100 },
    { x: 0, y: 0, width: 200, height: 200 },
    "right", 1
  );
  // rawLeft=10, rawRight=30, xScale=2, yScale=2
  // x=round(0+10*2)=20, y=round(0+20*2)=40, width=max(1,round(42))=42, height=max(1,round(42))=42
  assert.deepEqual(result, { x: 20, y: 40, width: 42, height: 42 });
});

test("getFrameVisibleRectFromBounds 镜像时交换 rawLeft/rawRight", () => {
  const result = frameGeometry.getFrameVisibleRectFromBounds(
    { left: 10, top: 20, right: 30, bottom: 40, imageWidth: 100, imageHeight: 100 },
    { x: 0, y: 0, width: 200, height: 200 },
    "left", 1
  );
  // rawLeft=100-1-30=69, rawRight=100-1-10=89
  // x=round(0+69*2)=138, width=max(1,round((89-69+1)*2))=42
  assert.deepEqual(result, { x: 138, y: 40, width: 42, height: 42 });
});

test("getFrameVisibleRectFromBounds 极小区域时 width/height 至少为 1", () => {
  const result = frameGeometry.getFrameVisibleRectFromBounds(
    { left: 50, top: 20, right: 10, bottom: 5, imageWidth: 100, imageHeight: 100 },
    { x: 0, y: 0, width: 200, height: 200 },
    "right", 1
  );
  // rawLeft=50, rawRight=10, width=max(1,round((10-50+1)*2))=max(1,round(-78))=1
  // height=max(1,round((5-20+1)*2))=max(1,round(-28))=1
  assert.deepEqual(result, { x: 100, y: 40, width: 1, height: 1 });
});

// getBottomAnchorFromVisibleRect
test("getBottomAnchorFromVisibleRect visibleRect 为 null 返回 null", () => {
  assert.equal(frameGeometry.getBottomAnchorFromVisibleRect(null), null);
});

test("getBottomAnchorFromVisibleRect 返回底边中心锚点", () => {
  const visibleRect = { x: 10, y: 20, width: 30, height: 40 };
  const result = frameGeometry.getBottomAnchorFromVisibleRect(visibleRect);
  // x=round(10+30/2)=25, y=round(20+40)=60
  assert.equal(result.x, 25);
  assert.equal(result.y, 60);
  assert.equal(result.visibleRect, visibleRect);
});

// getFrameVisibleCenterWindowX
test("getFrameVisibleCenterWindowX 按 X 偏移换算（probe.x=0）", () => {
  const result = frameGeometry.getFrameVisibleCenterWindowX(
    100,
    { x: 0, y: 0, width: 200, height: 200 },
    { x: 50, y: 0, width: 100, height: 100 }
  );
  // round(100-(50-0)-100/2)=round(0)=0
  assert.equal(result, 0);
});

test("getFrameVisibleCenterWindowX 按 X 偏移换算（probe.x=10）", () => {
  const result = frameGeometry.getFrameVisibleCenterWindowX(
    200,
    { x: 10, y: 0, width: 200, height: 200 },
    { x: 60, y: 0, width: 100, height: 100 }
  );
  // round(200-(60-10)-50)=round(100)=100
  assert.equal(result, 100);
});
