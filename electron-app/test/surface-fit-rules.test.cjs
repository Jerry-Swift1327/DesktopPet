const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const surfaceFit = require("../electron/pet/surface-fit-rules.cjs");

const source = fs.readFileSync(path.join(__dirname, "..", "electron", "pet", "surface-fit-rules.cjs"), "utf8");
// 剥离注释后再做字符串检查，避免首行文档性注释（含 "petScale" 等）误触断言
const sourceCode = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

// 结构断言
test("surface-fit-rules 不 require electron/fs/path", () => {
  assert.doesNotMatch(source, /require\("electron"/);
  assert.doesNotMatch(source, /require\("fs"/);
  assert.doesNotMatch(source, /require\("path"/);
});

test("surface-fit-rules 允许 require shared/bounds 但不 require pet-scale-rules", () => {
  // bounds.cjs 允许
  assert.ok(sourceCode.includes('require("../shared/bounds.cjs")'));
  // pet-scale-rules 不允许
  assert.doesNotMatch(sourceCode, /require\([^)]*pet-scale-rules/);
});

test("surface-fit-rules 不引用 nativeImage/窗口/screen/IPC/bubble/运行态变量", () => {
  const forbidden = [
    "nativeImage", "petWindow", "menuWindow", "hoverWindow",
    "screen", "safeSend", "broadcastToWindows", "bubble",
    "petScale", "preferredPetScale", "activeState", "walkDirection"
  ];
  for (const token of forbidden) {
    assert.ok(!sourceCode.includes(token), `不应出现 ${token}`);
  }
});

test("surface-fit-rules 导出 9 个函数", () => {
  const expected = [
    "getSurfaceVisibleTopFromGroundY",
    "getGroundedWindowYFromSurface",
    "clampWindowPositionToSurface",
    "getScaleCandidateForSurface",
    "getWindowXForVisibleEdge",
    "getWindowXForVisibleCenter",
    "getVisibleRectFromSpriteLeft",
    "getTaskbarWalkCenterLimits",
    "getSafeWindowXForDirection"
  ];
  for (const fn of expected) {
    assert.equal(typeof surfaceFit[fn], "function", `应导出 ${fn}`);
  }
  assert.equal(Object.keys(surfaceFit).length, expected.length, "导出数量应为 9");
});

// getSurfaceVisibleTopFromGroundY
test("getSurfaceVisibleTopFromGroundY 常规输入", () => {
  // groundY=800, spriteSize=200, top=10, bottom=20 → Math.round(800 - (200-10-20)) = 630
  assert.equal(surfaceFit.getSurfaceVisibleTopFromGroundY(800, 200, 10, 20), 630);
});

test("getSurfaceVisibleTopFromGroundY visibleInsetsTop=0", () => {
  // groundY=800, spriteSize=200, top=0, bottom=0 → Math.round(800 - 200) = 600
  assert.equal(surfaceFit.getSurfaceVisibleTopFromGroundY(800, 200, 0, 0), 600);
});

test("getSurfaceVisibleTopFromGroundY spriteSize = top + bottom", () => {
  // groundY=800, spriteSize=30, top=10, bottom=20 → Math.round(800 - 0) = 800
  assert.equal(surfaceFit.getSurfaceVisibleTopFromGroundY(800, 30, 10, 20), 800);
});

// getGroundedWindowYFromSurface
test("getGroundedWindowYFromSurface windowHeight < spriteSize（verticalInset=0）", () => {
  // visibleTop=630, windowHeight=180, spriteSize=200, top=10 → Math.round(630 - 0 - 10) = 620
  assert.equal(surfaceFit.getGroundedWindowYFromSurface(630, 180, 200, 10), 620);
});

test("getGroundedWindowYFromSurface windowHeight > spriteSize", () => {
  // visibleTop=630, windowHeight=220, spriteSize=200, top=10 → Math.round(630 - 20 - 10) = 600
  assert.equal(surfaceFit.getGroundedWindowYFromSurface(630, 220, 200, 10), 600);
});

// clampWindowPositionToSurface
test("clampWindowPositionToSurface x 超出左边界被钳到 minX", () => {
  // x=10, surfaceLeft=100, surfaceRight=900, visibleRect={x:50,width:100}
  // minX=10+100-50=60, maxX=10+900-150=760, x clamp 到 60, y=600
  const result = surfaceFit.clampWindowPositionToSurface(
    10, 500, 100, 900,
    { x: 50, y: 480, width: 100, height: 120 },
    600
  );
  assert.deepEqual(result, { x: 60, y: 600 });
});

test("clampWindowPositionToSurface x 超出右边界被钳到 maxX", () => {
  // x=950, surfaceLeft=100, surfaceRight=900, visibleRect={x:950,width:100}
  // minX=950+100-950=100, maxX=950+900-1050=800, clamp(950,100,800)=800
  const result = surfaceFit.clampWindowPositionToSurface(
    950, 500, 100, 900,
    { x: 950, y: 480, width: 100, height: 120 },
    600
  );
  assert.deepEqual(result, { x: 800, y: 600 });
});

test("clampWindowPositionToSurface 正常 x 不变", () => {
  // x=500, surfaceLeft=100, surfaceRight=900, visibleRect={x:450,width:100}
  // minX=500+100-450=150, maxX=500+900-550=850, x=500 在范围内
  const result = surfaceFit.clampWindowPositionToSurface(
    500, 500, 100, 900,
    { x: 450, y: 480, width: 100, height: 120 },
    600
  );
  assert.deepEqual(result, { x: 500, y: 600 });
});

// getScaleCandidateForSurface
test("getScaleCandidateForSurface surface 足够大返回 requestedScale", () => {
  // surfaceRight=2000, computeFitForScale 总返回 {visibleWidth:100, visibleHeight:100}
  const computeFitForScale = () => ({ visibleWidth: 100, visibleHeight: 100 });
  const result = surfaceFit.getScaleCandidateForSurface(
    0, 2000, 1000, 0, 8,
    1.5, 0.5, 3, 0.1,
    computeFitForScale
  );
  assert.equal(result, 1.5);
});

test("getScaleCandidateForSurface surface 太小逐级降级", () => {
  // s>=1 返回 {visibleWidth:500, visibleHeight:500}（500>200 放不下）
  // s<1 返回 {visibleWidth:100, visibleHeight:100}（100<=200 放得下）
  // 1.5→1.4→...→1.0→0.9，0.9 时满足
  const computeFitForScale = (s) =>
    s >= 1 ? { visibleWidth: 500, visibleHeight: 500 } : { visibleWidth: 100, visibleHeight: 100 };
  const result = surfaceFit.getScaleCandidateForSurface(
    0, 200, 1000, 0, 8,
    1.5, 0.5, 3, 0.1,
    computeFitForScale
  );
  assert.equal(result, 0.9);
});

test("getScaleCandidateForSurface 所有 scale 都放不下返回 null", () => {
  const computeFitForScale = () => ({ visibleWidth: 9999, visibleHeight: 9999 });
  const result = surfaceFit.getScaleCandidateForSurface(
    0, 200, 1000, 0, 8,
    1.5, 0.5, 3, 0.1,
    computeFitForScale
  );
  assert.equal(result, null);
});

test("getScaleCandidateForSurface 不修改任何外部变量", () => {
  // 用外部对象记录状态，断言调用结束后外部对象未被纯函数修改
  const external = { value: "unchanged", calls: 0 };
  const computeFitForScale = (scale) => {
    external.calls += 1;
    return { visibleWidth: 100, visibleHeight: 100 };
  };
  surfaceFit.getScaleCandidateForSurface(
    0, 2000, 1000, 0, 8,
    1.5, 0.5, 3, 0.1,
    computeFitForScale
  );
  // external.value 不应被纯函数改写
  assert.equal(external.value, "unchanged");
  // calls 应被回调递增（证明回调被调用）
  assert.ok(external.calls >= 1, "computeFitForScale 应至少被调用一次");
});

// getWindowXForVisibleEdge
test('getWindowXForVisibleEdge edge="left"', () => {
  // value=100, visibleRect={x:20,width:100}, probe={x:0} → Math.round(100 - (20-0)) = 80
  const result = surfaceFit.getWindowXForVisibleEdge(
    "left", 100,
    { x: 20, y: 0, width: 100, height: 100 },
    { x: 0, y: 0, width: 200, height: 200 }
  );
  assert.equal(result, 80);
});

test('getWindowXForVisibleEdge edge="right"', () => {
  // value=900, visibleRect={x:20,width:100}, probe={x:0} → Math.round(900 - 100 - 20) = 780
  const result = surfaceFit.getWindowXForVisibleEdge(
    "right", 900,
    { x: 20, y: 0, width: 100, height: 100 },
    { x: 0, y: 0, width: 200, height: 200 }
  );
  assert.equal(result, 780);
});

// getWindowXForVisibleCenter
test("getWindowXForVisibleCenter 常规输入", () => {
  // centerX=500, visibleRect={x:20,width:100}, probe={x:0} → Math.round(500 - 20 - 50) = 430
  const result = surfaceFit.getWindowXForVisibleCenter(
    500,
    { x: 20, y: 0, width: 100, height: 100 },
    { x: 0, y: 0, width: 200, height: 200 }
  );
  assert.equal(result, 430);
});

// getVisibleRectFromSpriteLeft
test("getVisibleRectFromSpriteLeft insets 偏移", () => {
  // spriteLeft=100, spriteTop=200, spriteSize=200, insets={left:10,top:20,right:30,bottom:40}
  // x=110, y=220, width=160, height=140
  const result = surfaceFit.getVisibleRectFromSpriteLeft(100, 200, 200, {
    left: 10, top: 20, right: 30, bottom: 40
  });
  assert.deepEqual(result, { x: 110, y: 220, width: 160, height: 140 });
});

test("getVisibleRectFromSpriteLeft width/height 至少为 1", () => {
  // spriteSize=30, insets={left:10,top:20,right:30,bottom:40}
  // width=max(1, 30-10-30)=1, height=max(1,30-20-40)=1
  const result = surfaceFit.getVisibleRectFromSpriteLeft(0, 0, 30, {
    left: 10, top: 20, right: 30, bottom: 40
  });
  assert.equal(result.width, 1);
  assert.equal(result.height, 1);
});

// getTaskbarWalkCenterLimits
test("getTaskbarWalkCenterLimits 正常输入", () => {
  // limits={left:0,right:1000}, spriteSize=200
  // leftInsets={left:10,right:20} → leftVisibleWidth=170
  // rightInsets={left:15,right:25} → rightVisibleWidth=160
  // halfWidth=max(170,160)/2=85, left=ceil(0+85)=85, right=floor(1000-85)=915
  const result = surfaceFit.getTaskbarWalkCenterLimits(
    { left: 0, right: 1000 }, 200,
    { left: 10, top: 0, right: 20, bottom: 0 },
    { left: 15, top: 0, right: 25, bottom: 0 }
  );
  assert.deepEqual(result, { left: 85, right: 915 });
});

test("getTaskbarWalkCenterLimits left>right 返回中心点", () => {
  // limits={left:0,right:100}, spriteSize=200, insets 全 0
  // leftVisibleWidth=rightVisibleWidth=200, halfWidth=100
  // left=ceil(0+100)=100, right=floor(100-100)=0, left>right
  // center=round((0+100)/2)=50
  const result = surfaceFit.getTaskbarWalkCenterLimits(
    { left: 0, right: 100 }, 200,
    { left: 0, right: 0 },
    { left: 0, right: 0 }
  );
  assert.deepEqual(result, { left: 50, right: 50 });
});

// getSafeWindowXForDirection
test("getSafeWindowXForDirection 不超边界不调整", () => {
  // x=500, limits={left:100,right:900}, visibleRect={x:450,width:100}
  // 450<100? 否; 550>900? 否 → 500
  const result = surfaceFit.getSafeWindowXForDirection(
    500,
    { left: 100, right: 900 },
    { x: 450, width: 100 }
  );
  assert.equal(result, 500);
});

test("getSafeWindowXForDirection 超左边界右移", () => {
  // x=50, limits={left:100,right:900}, visibleRect={x:50,width:100}
  // 50<100? 是 → nextX += 100-50 = 100
  const result = surfaceFit.getSafeWindowXForDirection(
    50,
    { left: 100, right: 900 },
    { x: 50, width: 100 }
  );
  assert.equal(result, 100);
});

test("getSafeWindowXForDirection 超右边界左移", () => {
  // x=850, limits={left:100,right:900}, visibleRect={x:850,width:100}
  // 850<100? 否; 950>900? 是 → nextX -= 950-900 = 800
  const result = surfaceFit.getSafeWindowXForDirection(
    850,
    { left: 100, right: 900 },
    { x: 850, width: 100 }
  );
  assert.equal(result, 800);
});
