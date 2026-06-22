const test = require("node:test");
const assert = require("node:assert/strict");
const {
  clamp,
  expandRect,
  cloneRect,
  boundsAreEqual,
  isPointInsideRect,
  rectsOverlap,
  rectFitsInArea,
  getRectCenter,
  getRectCenterDistance,
  getRectClosestEdgeDistance,
  normalizeBounds,
  isValidRect
} = require("../electron/shared/bounds.cjs");

// clamp：将数值限制在 [min, max] 区间内
test("clamp 保留区间内的正常值", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(7, 0, 10), 7);
});

test("clamp 返回边界值本身", () => {
  assert.equal(clamp(0, 0, 10), 0);
  assert.equal(clamp(10, 0, 10), 10);
});

test("clamp 将超出范围的值钳到边界", () => {
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
  assert.equal(clamp(100, 0, 10), 10);
});

// expandRect：将矩形四边各向外扩展指定像素
test("expandRect 按正数 padding 向外扩展", () => {
  assert.deepEqual(expandRect({ x: 10, y: 10, width: 20, height: 20 }, 5), {
    x: 5,
    y: 5,
    width: 30,
    height: 30
  });
});

test("expandRect 零 padding 保持原矩形", () => {
  assert.deepEqual(expandRect({ x: 10, y: 10, width: 20, height: 20 }, 0), {
    x: 10,
    y: 10,
    width: 20,
    height: 20
  });
});

test("expandRect 负数 padding 被钳为 0", () => {
  assert.deepEqual(expandRect({ x: 10, y: 10, width: 20, height: 20 }, -5), {
    x: 10,
    y: 10,
    width: 20,
    height: 20
  });
});

test("expandRect 对 null 输入返回 null", () => {
  assert.equal(expandRect(null, 5), null);
});

// cloneRect：克隆矩形对象，保留 resolvedOverlayPetRect 标记
test("cloneRect 生成深拷贝，修改副本不影响原对象", () => {
  const original = { x: 1, y: 2, width: 3, height: 4 };
  const cloned = cloneRect(original);

  assert.deepEqual(cloned, original);
  cloned.x = 999;
  assert.equal(original.x, 1);
});

test("cloneRect 对 null 和 undefined 输入返回 null", () => {
  assert.equal(cloneRect(null), null);
  assert.equal(cloneRect(undefined), null);
});

test("cloneRect 保留 resolvedOverlayPetRect 标记", () => {
  const withMarker = { x: 1, y: 2, width: 3, height: 4, resolvedOverlayPetRect: true };
  const cloned = cloneRect(withMarker);

  assert.equal(cloned.resolvedOverlayPetRect, true);
});

test("cloneRect 不为无标记的矩形添加 resolvedOverlayPetRect", () => {
  const withoutMarker = { x: 1, y: 2, width: 3, height: 4 };
  const cloned = cloneRect(withoutMarker);

  assert.equal(cloned.resolvedOverlayPetRect, undefined);
});

// boundsAreEqual：判断两个矩形是否完全相等
test("boundsAreEqual 对相等的矩形返回 true", () => {
  assert.equal(
    boundsAreEqual({ x: 1, y: 2, width: 3, height: 4 }, { x: 1, y: 2, width: 3, height: 4 }),
    true
  );
});

test("boundsAreEqual 对不等的矩形返回 false", () => {
  assert.equal(
    boundsAreEqual({ x: 1, y: 2, width: 3, height: 4 }, { x: 9, y: 2, width: 3, height: 4 }),
    false
  );
  assert.equal(
    boundsAreEqual({ x: 1, y: 2, width: 3, height: 4 }, { x: 1, y: 2, width: 9, height: 4 }),
    false
  );
});

test("boundsAreEqual 对 null 输入返回 false", () => {
  assert.equal(boundsAreEqual(null, { x: 1, y: 2, width: 3, height: 4 }), false);
  assert.equal(boundsAreEqual({ x: 1, y: 2, width: 3, height: 4 }, null), false);
  assert.equal(boundsAreEqual(null, null), false);
});

// isPointInsideRect：判断点是否落在矩形内部
test("isPointInsideRect 点在矩形内返回 true", () => {
  assert.equal(isPointInsideRect({ x: 5, y: 5 }, { x: 0, y: 0, width: 10, height: 10 }), true);
});

test("isPointInsideRect 点在矩形外返回 false", () => {
  assert.equal(isPointInsideRect({ x: 15, y: 15 }, { x: 0, y: 0, width: 10, height: 10 }), false);
  assert.equal(isPointInsideRect({ x: -1, y: 5 }, { x: 0, y: 0, width: 10, height: 10 }), false);
});

test("isPointInsideRect 边界点视为内部（闭区间）", () => {
  assert.equal(isPointInsideRect({ x: 0, y: 0 }, { x: 0, y: 0, width: 10, height: 10 }), true);
  assert.equal(isPointInsideRect({ x: 10, y: 10 }, { x: 0, y: 0, width: 10, height: 10 }), true);
});

test("isPointInsideRect 对 null 矩形返回 false", () => {
  assert.equal(isPointInsideRect({ x: 5, y: 5 }, null), false);
});

// rectsOverlap：判断两个矩形是否存在重叠
test("rectsOverlap 重叠矩形返回 true", () => {
  assert.equal(
    rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }),
    true
  );
});

test("rectsOverlap 不重叠矩形返回 false", () => {
  assert.equal(
    rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 100, y: 100, width: 10, height: 10 }),
    false
  );
});

test("rectsOverlap 仅相邻不重叠返回 false", () => {
  assert.equal(
    rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 }),
    false
  );
});

test("rectsOverlap 对 null 输入返回 false", () => {
  assert.equal(rectsOverlap(null, { x: 0, y: 0, width: 10, height: 10 }), false);
  assert.equal(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, null), false);
});

// rectFitsInArea：判断矩形是否完全包含在区域内
test("rectFitsInArea 矩形完全在区域内返回 true", () => {
  assert.equal(
    rectFitsInArea({ x: 5, y: 5, width: 5, height: 5 }, { x: 0, y: 0, width: 20, height: 20 }),
    true
  );
});

test("rectFitsInArea 矩形超出区域返回 false", () => {
  assert.equal(
    rectFitsInArea({ x: -1, y: 5, width: 5, height: 5 }, { x: 0, y: 0, width: 20, height: 20 }),
    false
  );
  assert.equal(
    rectFitsInArea({ x: 16, y: 5, width: 5, height: 5 }, { x: 0, y: 0, width: 20, height: 20 }),
    false
  );
});

test("rectFitsInArea 矩形与区域边界重合视为适合", () => {
  assert.equal(
    rectFitsInArea({ x: 0, y: 0, width: 20, height: 20 }, { x: 0, y: 0, width: 20, height: 20 }),
    true
  );
});

// getRectCenter：计算矩形的中心点
test("getRectCenter 返回矩形中心点", () => {
  assert.deepEqual(getRectCenter({ x: 0, y: 0, width: 10, height: 20 }), { x: 5, y: 10 });
  assert.deepEqual(getRectCenter({ x: 10, y: 10, width: 20, height: 20 }), { x: 20, y: 20 });
});

// getRectCenterDistance：计算两个矩形中心点的曼哈顿距离
test("getRectCenterDistance 返回中心点曼哈顿距离", () => {
  assert.equal(
    getRectCenterDistance({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 }),
    10
  );
  assert.equal(
    getRectCenterDistance({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 10, width: 10, height: 10 }),
    10
  );
});

test("getRectCenterDistance 对相同矩形返回 0", () => {
  assert.equal(
    getRectCenterDistance({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 0, width: 10, height: 10 }),
    0
  );
});

// getRectClosestEdgeDistance：计算矩形到区域最近边缘的距离
test("getRectClosestEdgeDistance 返回最近边缘距离", () => {
  assert.equal(
    getRectClosestEdgeDistance({ x: 5, y: 5, width: 5, height: 5 }, { x: 0, y: 0, width: 20, height: 20 }),
    5
  );
});

test("getRectClosestEdgeDistance 矩形贴边时返回 0", () => {
  assert.equal(
    getRectClosestEdgeDistance({ x: 0, y: 0, width: 20, height: 20 }, { x: 0, y: 0, width: 20, height: 20 }),
    0
  );
});

// normalizeBounds：将 bounds 规范化为整数坐标 + 指定宽高的对象
test("normalizeBounds 四舍五入坐标并设置指定宽高", () => {
  assert.deepEqual(normalizeBounds({ x: 10.4, y: 20.6 }, 100, 200), {
    x: 10,
    y: 21,
    width: 100,
    height: 200
  });
});

test("normalizeBounds 保留整数坐标", () => {
  assert.deepEqual(normalizeBounds({ x: 10, y: 20 }, 100, 200), {
    x: 10,
    y: 20,
    width: 100,
    height: 200
  });
});

// isValidRect：判断矩形是否合法（坐标有限且 right>left、bottom>top）
test("isValidRect 合法矩形返回 true", () => {
  assert.equal(isValidRect({ left: 0, top: 0, right: 10, bottom: 10 }), true);
});

test("isValidRect right 不大于 left 返回 false", () => {
  assert.equal(isValidRect({ left: 10, top: 0, right: 10, bottom: 10 }), false);
  assert.equal(isValidRect({ left: 20, top: 0, right: 10, bottom: 10 }), false);
});

test("isValidRect bottom 不大于 top 返回 false", () => {
  assert.equal(isValidRect({ left: 0, top: 10, right: 10, bottom: 10 }), false);
});

test("isValidRect 非有限坐标返回 false", () => {
  assert.equal(isValidRect({ left: NaN, top: 0, right: 10, bottom: 10 }), false);
  assert.equal(isValidRect({ left: 0, top: Infinity, right: 10, bottom: 10 }), false);
  assert.equal(isValidRect({ left: 0, top: 0, right: undefined, bottom: 10 }), false);
});
