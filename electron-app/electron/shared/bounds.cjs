// 纯几何工具函数，无副作用

// 将数值限制在 [min, max] 区间内
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// 将矩形四边各向外扩展指定像素
function expandRect(rect, padding) {
  if (!rect) {
    return null;
  }

  const safePadding = Math.max(0, Math.round(padding));
  return {
    x: Math.round(rect.x - safePadding),
    y: Math.round(rect.y - safePadding),
    width: Math.round(rect.width + safePadding * 2),
    height: Math.round(rect.height + safePadding * 2)
  };
}

// 克隆矩形对象，保留 resolvedOverlayPetRect 标记
function cloneRect(rect) {
  if (!rect) {
    return null;
  }
  const cloned = {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
  // 内联判断 resolvedOverlayPetRect 标记，避免依赖外部函数
  if (Boolean(rect?.resolvedOverlayPetRect)) {
    cloned.resolvedOverlayPetRect = true;
  }
  return cloned;
}

// 判断两个矩形（x/y/width/height）是否完全相等
function boundsAreEqual(left, right) {
  return Boolean(left && right)
    && left.x === right.x
    && left.y === right.y
    && left.width === right.width
    && left.height === right.height;
}

// 判断点是否落在矩形内部
function isPointInsideRect(point, rect) {
  if (!rect) {
    return false;
  }
  return point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height;
}

// 判断两个矩形是否存在重叠
function rectsOverlap(left, right) {
  if (!left || !right) {
    return false;
  }

  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

// 判断矩形是否完全包含在区域内
function rectFitsInArea(rect, area) {
  return rect.x >= area.x
    && rect.y >= area.y
    && rect.x + rect.width <= area.x + area.width
    && rect.y + rect.height <= area.y + area.height;
}

// 计算矩形的中心点
function getRectCenter(rect) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
}

// 计算两个矩形中心点的曼哈顿距离
function getRectCenterDistance(left, right) {
  const leftCenter = getRectCenter(left);
  const rightCenter = getRectCenter(right);
  return Math.round(Math.abs(leftCenter.x - rightCenter.x) + Math.abs(leftCenter.y - rightCenter.y));
}

// 计算矩形到区域最近边缘的距离
function getRectClosestEdgeDistance(rect, area) {
  const leftGap = rect.x - area.x;
  const rightGap = area.x + area.width - (rect.x + rect.width);
  const topGap = rect.y - area.y;
  const bottomGap = area.y + area.height - (rect.y + rect.height);
  return Math.min(leftGap, rightGap, topGap, bottomGap);
}

// 将 bounds 规范化为整数坐标 + 指定宽高的对象
function normalizeBounds(bounds, width, height) {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width,
    height
  };
}

// 判断矩形是否合法（坐标有限且 right>left、bottom>top）
function isValidRect(rect) {
  return Number.isFinite(rect.left)
    && Number.isFinite(rect.top)
    && Number.isFinite(rect.right)
    && Number.isFinite(rect.bottom)
    && rect.right > rect.left
    && rect.bottom > rect.top;
}

module.exports = {
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
};
