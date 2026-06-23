// overlay 窗口定位几何，含菜单/悬停/气泡/自定义面板的位置计算
// 从 main.cjs 提取的纯定位计算函数，依赖通过 createOverlayGeometry(context) 注入。
// 函数实现与 main.cjs 保持一致，仅将全局变量引用改为通过 context 访问器访问。

const { screen } = require("electron");

function createOverlayGeometry(context) {
  const {
    // 全局状态访问器
    getActiveState,
    getWalkDirection,
    getCurrentSurface,
    getPetWindow,
    getPetScale,
    getMenuFrozenPetRect,
    getHoverFrozenPetRect,
    getCustomizationFrozenPetRect,
    getTaskbarWalkRunway,
    getCurrentMenuHeight,
    getMenuPlacementSnapshot,
    // 全局缓存锚点访问器（与下方计算函数同名，故别名以避免遮蔽）
    getMenuAnchorRect: getMenuAnchorRectValue,
    getHoverAnchorRect: getHoverAnchorRectValue,
    getCustomizationAnchorRect: getCustomizationAnchorRectValue,
    // 依赖函数（main.cjs 内部实现）
    getPetSpriteRect,
    getScaledOverlayCollisionPadding,
    getScaledHoverBodyHitPadding,
    getScaledHoverAvoidPadding,
    getWindowRect,
    isResolvedOverlayPetRect,
    getVisiblePetRect,
    getRenderedFrameVisibleRect,
    getRenderedFrameVisibleRectFromBounds,
    getVisiblePetRectFromBounds,
    getRenderedFrameHeadRectFromBounds,
    getSpriteRectFromBounds,
    getStateVisibleBounds,
    getStateHeadBounds,
    getState,
    getTaskbarWalkOverlayPetRect,
    isTaskbarWalkActive,
    // 纯工具函数（来自 shared/bounds.cjs）
    expandRect,
    clamp,
    rectsOverlap,
    rectFitsInArea,
    getRectClosestEdgeDistance,
    getRectCenterDistance,
    cloneRect,
    // 常量
    OVERLAY_BASE_GAP,
    OVERLAY_GAP_MIN,
    OVERLAY_GAP_MAX,
    OVERLAY_VERTICAL_OFFSET,
    PET_MENU_HEAD_X_OFFSET,
    PET_MENU_HEAD_Y_OFFSET,
    PET_MENU_SCALE_UP_VERTICAL_FACTOR,
    PET_MENU_SCALE_DOWN_VERTICAL_FACTOR,
    PET_MENU_BASE_VERTICAL_LIFT,
    PET_MENU_VERTICAL_OFFSET,
    PET_MENU_VERTICAL_LIFT_MIN,
    PET_MENU_VERTICAL_LIFT_MAX,
    PET_MENU_GAP_OFFSET,
    PET_MENU_SCALE_GAP_FACTOR,
    PET_MENU_WIDTH,
    PET_MENU_COLLAPSED_HEIGHT,
    PET_MENU_MIN_HEIGHT,
    PET_MENU_MAX_HEIGHT,
    HOVER_PANEL_GAP_OFFSET,
    HOVER_PANEL_SCALE_GAP_FACTOR,
    HOVER_PANEL_WIDTH,
    HOVER_PANEL_HEIGHT,
    HOVER_PANEL_VERTICAL_OFFSET,
    CUSTOMIZATION_PANEL_WIDTH,
    CUSTOMIZATION_PANEL_HEIGHT
  } = context;

  function getOverlayWorkArea(rect) {
    if (!rect) {
      return screen.getPrimaryDisplay().workArea;
    }
    return screen.getDisplayMatching(rect).workArea;
  }

  function getOverlayPlacementRect(anchorRect = null, stateId = getActiveState(), direction = getWalkDirection()) {
    const fullRect = anchorRect || getWindowRect(getPetWindow());
    if (isResolvedOverlayPetRect(fullRect)) {
      return cloneRect(fullRect);
    }
    if (fullRect) {
      const frameRect = getRenderedFrameVisibleRectFromBounds(fullRect, stateId, direction);
      if (frameRect) {
        return frameRect;
      }
      return getVisiblePetRectFromBounds(fullRect, stateId, direction);
    }
    return getVisiblePetRect() || getPetSpriteRect();
  }

  function getMenuHeadAnchorRect(anchorRect = null, stateId = getActiveState(), direction = getWalkDirection()) {
    const fullRect = anchorRect || getWindowRect(getPetWindow());
    if (isResolvedOverlayPetRect(fullRect)) {
      return cloneRect(fullRect);
    }
    if (!fullRect) {
      return getOverlayPlacementRect(anchorRect, stateId, direction);
    }

    const frameHeadRect = getRenderedFrameHeadRectFromBounds(fullRect, stateId, direction);
    if (frameHeadRect) {
      return frameHeadRect;
    }

    const spriteRect = getSpriteRectFromBounds(fullRect);
    const visibleBounds = getStateVisibleBounds(stateId);
    const headBounds = getStateHeadBounds(stateId) || visibleBounds;
    if (!headBounds || !headBounds.imageWidth || !headBounds.imageHeight) {
      return getOverlayPlacementRect(fullRect, stateId, direction);
    }

    const state = getState(stateId);
    const shouldMirror = state?.defaultFacing === "left" ? direction > 0 : direction < 0;
    const rawLeft = shouldMirror
      ? headBounds.imageWidth - 1 - headBounds.right
      : headBounds.left;
    const rawRight = shouldMirror
      ? headBounds.imageWidth - 1 - headBounds.left
      : headBounds.right;
    const xScale = spriteRect.width / headBounds.imageWidth;
    const yScale = spriteRect.height / headBounds.imageHeight;
    return {
      x: Math.round(spriteRect.x + rawLeft * xScale + PET_MENU_HEAD_X_OFFSET),
      y: Math.round(spriteRect.y + headBounds.top * yScale + PET_MENU_HEAD_Y_OFFSET),
      width: Math.max(1, Math.round((rawRight - rawLeft + 1) * xScale)),
      height: Math.max(1, Math.round((headBounds.bottom - headBounds.top + 1) * yScale))
    };
  }

  function getMenuAnchorRect(anchorRect = null) {
    if (anchorRect) {
      return anchorRect;
    }
    if (getMenuFrozenPetRect()) {
      return getMenuFrozenPetRect();
    }
    if (getTaskbarWalkRunway() && isTaskbarWalkActive()) {
      return getTaskbarWalkOverlayPetRect() || getPetSpriteRect() || getVisiblePetRect();
    }
    return getWindowRect(getPetWindow()) || getPetSpriteRect() || getVisiblePetRect();
  }

  function getHoverAnchorRect(anchorRect = null) {
    if (anchorRect) {
      return anchorRect;
    }
    if (getHoverFrozenPetRect()) {
      return getHoverFrozenPetRect();
    }
    if (getTaskbarWalkRunway() && isTaskbarWalkActive()) {
      return getTaskbarWalkOverlayPetRect() || getPetSpriteRect() || getVisiblePetRect();
    }
    return getWindowRect(getPetWindow()) || getPetSpriteRect() || getVisiblePetRect();
  }

  function getOverlayScaleDelta() {
    return getPetScale() - 1;
  }

  function getOverlayVisualGap(offset = 0, scaleFactor = 0) {
    const scaledGap = OVERLAY_BASE_GAP + getOverlayScaleDelta() * scaleFactor;
    return Math.round(clamp(scaledGap + offset, OVERLAY_GAP_MIN, OVERLAY_GAP_MAX));
  }

  function getHoverBodyHitPaddingForState(stateId = getActiveState()) {
    const basePadding = getScaledHoverBodyHitPadding();
    const state = getState(stateId);
    if (!state?.moving) {
      return basePadding;
    }
    if (isTaskbarWalkActive()) {
      return Math.max(0, basePadding - 1);
    }
    // Moving states are sampled while the sprite keeps shifting, so use a
    // slightly wider tolerance to avoid hover misses between poll ticks.
    return basePadding + 2;
  }

  function getOverlayVerticalOffset(offset = 0, scaleFactor = 0) {
    return Math.round(OVERLAY_VERTICAL_OFFSET + offset - getOverlayScaleDelta() * scaleFactor);
  }

  function getMenuVerticalLift() {
    const scaleDelta = getOverlayScaleDelta();
    const scaleAdjustment = scaleDelta >= 0
      ? scaleDelta * PET_MENU_SCALE_UP_VERTICAL_FACTOR
      : scaleDelta * PET_MENU_SCALE_DOWN_VERTICAL_FACTOR;
    return Math.round(clamp(
      PET_MENU_BASE_VERTICAL_LIFT + scaleAdjustment + PET_MENU_VERTICAL_OFFSET,
      PET_MENU_VERTICAL_LIFT_MIN,
      PET_MENU_VERTICAL_LIFT_MAX
    ));
  }

  function getHoverHitRect() {
    const rect = getHoverFrozenPetRect()
      ? getOverlayPlacementRect(getHoverFrozenPetRect())
      : getRenderedFrameVisibleRect() || getVisiblePetRect();
    return expandRect(rect, getHoverBodyHitPaddingForState());
  }

  function getOverlayAvoidRect(anchorRect = null) {
    const rect = getOverlayPlacementRect(anchorRect);
    return expandRect(rect, getScaledOverlayCollisionPadding());
  }

  function getHoverAvoidRect(anchorRect = null) {
    const rect = getOverlayPlacementRect(anchorRect);
    return expandRect(rect, getScaledHoverAvoidPadding());
  }

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

  // 菜单候选间距校验（getMenuPosition 内部使用）
  function isMenuCandidateSpacingValid(rect, kind, petRect, minHorizontalGap, minVerticalGap) {
    const gaps = getMenuCandidateGaps(rect, kind, petRect);
    return gaps.horizontal >= minHorizontalGap && gaps.vertical >= minVerticalGap;
  }

  // 菜单候选打分（getMenuPosition 内部使用）
  function scoreMenuCandidate(entry, petRect, minHorizontalGap, minVerticalGap, area) {
    const gaps = getMenuCandidateGaps(entry.rect, entry.kind, petRect);
    const horizontalShortfall = Math.max(0, minHorizontalGap - gaps.horizontal);
    const verticalShortfall = Math.max(0, minVerticalGap - gaps.vertical);
    const edgeDistance = getRectClosestEdgeDistance(entry.rect, area);
    const edgePenalty = edgeDistance < 8 ? (8 - edgeDistance) * 36 : 0;
    return entry.priority * 1200
      + horizontalShortfall * 120
      + verticalShortfall * 120
      + Math.max(0, entry.shift || 0) * 12
      + edgePenalty;
  }

  function getMenuPosition(anchorRect = getMenuAnchorRectValue(), height = getCurrentMenuHeight()) {
    const snapshot = getMenuPlacementSnapshot()
      && getMenuPlacementSnapshot().anchorRect
      && anchorRect
      && getMenuPlacementSnapshot().anchorRect.x === Math.round(anchorRect.x)
      && getMenuPlacementSnapshot().anchorRect.y === Math.round(anchorRect.y)
      && getMenuPlacementSnapshot().anchorRect.width === Math.round(anchorRect.width)
      && getMenuPlacementSnapshot().anchorRect.height === Math.round(anchorRect.height)
        ? getMenuPlacementSnapshot()
        : null;
    const fullPetRect = snapshot?.anchorRect || getMenuAnchorRect(anchorRect);
    const petRect = snapshot?.petRect || getOverlayPlacementRect(fullPetRect);
    const baseGap = getOverlayVisualGap(PET_MENU_GAP_OFFSET, PET_MENU_SCALE_GAP_FACTOR);
    const horizontalGap = clamp(Math.round(baseGap * 0.95), 14, 36);
    const verticalGap = clamp(Math.round(baseGap * 0.7), 10, 28);
    const minHorizontalGap = Math.max(10, Math.round(horizontalGap * 0.78));
    const minVerticalGap = Math.max(8, Math.round(verticalGap * 0.78));
    const edgeGap = clamp(Math.round(verticalGap * 0.7), 8, 16);
    const avoidRect = expandRect(petRect, getScaledOverlayCollisionPadding());
    const surface = getCurrentSurface();
    const rawArea = getOverlayWorkArea(petRect);
    const area = getMenuPlacementArea(rawArea, surface, edgeGap);
    const menuHeight = clamp(Math.ceil(Number(height) || PET_MENU_COLLAPSED_HEIGHT), PET_MENU_MIN_HEIGHT, PET_MENU_MAX_HEIGHT);
    const candidates = [
      {
        kind: "right-up",
        x: petRect.x + petRect.width + horizontalGap,
        y: petRect.y - menuHeight - verticalGap,
        width: PET_MENU_WIDTH,
        height: menuHeight,
        priority: 0
      },
      {
        kind: "left-up",
        x: petRect.x - PET_MENU_WIDTH - horizontalGap,
        y: petRect.y - menuHeight - verticalGap,
        width: PET_MENU_WIDTH,
        height: menuHeight,
        priority: 1
      },
      {
        kind: "right-down",
        x: petRect.x + petRect.width + horizontalGap,
        y: petRect.y + petRect.height + verticalGap,
        width: PET_MENU_WIDTH,
        height: menuHeight,
        priority: 2
      },
      {
        kind: "left-down",
        x: petRect.x - PET_MENU_WIDTH - horizontalGap,
        y: petRect.y + petRect.height + verticalGap,
        width: PET_MENU_WIDTH,
        height: menuHeight,
        priority: 3
      }
    ];

    const normalizedCandidates = candidates.map((candidate) => ({
      ...candidate,
      rect: {
        x: Math.round(candidate.x),
        y: Math.round(candidate.y),
        width: PET_MENU_WIDTH,
        height: menuHeight
      }
    }));

    for (const candidate of normalizedCandidates) {
      if (!rectFitsInArea(candidate.rect, area)) {
        continue;
      }
      if (rectsOverlap(candidate.rect, avoidRect)) {
        continue;
      }
      if (!isMenuCandidateSpacingValid(candidate.rect, candidate.kind, petRect, minHorizontalGap, minVerticalGap)) {
        continue;
      }
      return candidate.rect;
    }

    const clampedCandidates = normalizedCandidates.map((candidate) => {
      const clamped = clampPanelRect(candidate.rect, area, PET_MENU_WIDTH, menuHeight);
      const shift = Math.abs(clamped.x - candidate.rect.x) + Math.abs(clamped.y - candidate.rect.y);
      return {
        ...candidate,
        rect: clamped,
        shift
      };
    });

    for (const candidate of clampedCandidates) {
      if (rectsOverlap(candidate.rect, avoidRect)) {
        continue;
      }
      if (!isMenuCandidateSpacingValid(candidate.rect, candidate.kind, petRect, minHorizontalGap, minVerticalGap)) {
        continue;
      }
      return candidate.rect;
    }

    const nonOverlappingCandidates = clampedCandidates.filter((candidate) => !rectsOverlap(candidate.rect, avoidRect));
    if (nonOverlappingCandidates.length > 0) {
      return nonOverlappingCandidates
        .map((candidate) => ({
          rect: candidate.rect,
          score: scoreMenuCandidate(candidate, petRect, minHorizontalGap, minVerticalGap, area)
        }))
        .sort((left, right) => left.score - right.score)[0].rect;
    }

    for (const candidate of candidates) {
      const forced = clampPanelRect(candidate, area, PET_MENU_WIDTH, menuHeight);
      if (!rectsOverlap(forced, avoidRect)) {
        return forced;
      }
    }

    return clampPanelRect(candidates[0], area, PET_MENU_WIDTH, menuHeight);
  }

  function getHoverPosition(anchorRect = getHoverAnchorRectValue()) {
    const fullPetRect = getHoverAnchorRect(anchorRect);
    const petRect = getOverlayPlacementRect(fullPetRect);
    const avoidRect = getHoverAvoidRect(fullPetRect);
    const panelGap = getOverlayVisualGap(HOVER_PANEL_GAP_OFFSET, HOVER_PANEL_SCALE_GAP_FACTOR);
    const rawArea = getOverlayWorkArea(avoidRect);
    const area = getOverlaySafeArea(rawArea, panelGap);
    const areaRight = area.x + area.width;
    const areaBottom = area.y + area.height;
    const verticalOffset = getOverlayVerticalOffset(HOVER_PANEL_VERTICAL_OFFSET);
    const centeredX = petRect.x + Math.round((petRect.width - HOVER_PANEL_WIDTH) / 2);
    const sideY = petRect.y + Math.round((petRect.height - HOVER_PANEL_HEIGHT) / 2) + verticalOffset;

    const above = {
      x: clamp(centeredX, area.x, areaRight - HOVER_PANEL_WIDTH),
      y: Math.round(avoidRect.y - HOVER_PANEL_HEIGHT - panelGap + verticalOffset),
      width: HOVER_PANEL_WIDTH,
      height: HOVER_PANEL_HEIGHT
    };
    if (above.y >= area.y && !rectsOverlap(above, avoidRect)) {
      return above;
    }

    const right = {
      x: Math.round(avoidRect.x + avoidRect.width + panelGap),
      y: clamp(sideY, area.y, areaBottom - HOVER_PANEL_HEIGHT),
      width: HOVER_PANEL_WIDTH,
      height: HOVER_PANEL_HEIGHT
    };
    const left = {
      x: Math.round(avoidRect.x - HOVER_PANEL_WIDTH - panelGap),
      y: clamp(sideY, area.y, areaBottom - HOVER_PANEL_HEIGHT),
      width: HOVER_PANEL_WIDTH,
      height: HOVER_PANEL_HEIGHT
    };
    const rightFits = right.x + HOVER_PANEL_WIDTH <= areaRight && !rectsOverlap(right, avoidRect);
    const leftFits = left.x >= area.x && !rectsOverlap(left, avoidRect);
    if (rightFits && leftFits) {
      const rightSpace = areaRight - (avoidRect.x + avoidRect.width);
      const leftSpace = avoidRect.x - area.x;
      return rightSpace >= leftSpace ? right : left;
    } else if (rightFits) {
      return right;
    } else if (leftFits) {
      return left;
    }

    const below = {
      x: clamp(centeredX, area.x, areaRight - HOVER_PANEL_WIDTH),
      y: Math.round(avoidRect.y + avoidRect.height + panelGap + verticalOffset),
      width: HOVER_PANEL_WIDTH,
      height: HOVER_PANEL_HEIGHT
    };
    if (below.y + HOVER_PANEL_HEIGHT <= areaBottom && !rectsOverlap(below, avoidRect)) {
      return below;
    }

    const preferred = {
      x: Math.round(above.x),
      y: Math.round(above.y),
      width: HOVER_PANEL_WIDTH,
      height: HOVER_PANEL_HEIGHT
    };
    const fallbackCandidates = [above, right, left, below]
      .map((candidate) => {
        const rounded = {
          x: Math.round(candidate.x),
          y: Math.round(candidate.y),
          width: HOVER_PANEL_WIDTH,
          height: HOVER_PANEL_HEIGHT
        };
        const clamped = clampPanelRect(rounded, area, HOVER_PANEL_WIDTH, HOVER_PANEL_HEIGHT);
        const shift = Math.abs(clamped.x - rounded.x) + Math.abs(clamped.y - rounded.y);
        return { rect: clamped, shift };
      })
      .filter((entry) => !rectsOverlap(entry.rect, avoidRect));
    if (fallbackCandidates.length > 0) {
      return pickBestOverlayCandidate(
        fallbackCandidates,
        preferred,
        area,
        rawArea,
        Math.max(8, Math.round(panelGap * 0.45))
      );
    }

    const forcedRightX = Math.min(Math.max(avoidRect.x + avoidRect.width + panelGap, area.x), areaRight - HOVER_PANEL_WIDTH);
    const forcedLeftX = Math.max(Math.min(avoidRect.x - HOVER_PANEL_WIDTH - panelGap, areaRight - HOVER_PANEL_WIDTH), area.x);
    const forcedSide = avoidRect.x - area.x > areaRight - (avoidRect.x + avoidRect.width)
      ? { ...left, x: forcedLeftX }
      : { ...right, x: forcedRightX };
    const forcedY = avoidRect.y >= area.y + Math.round(area.height / 2)
      ? Math.max(area.y, avoidRect.y - HOVER_PANEL_HEIGHT - panelGap + verticalOffset)
      : Math.min(areaBottom - HOVER_PANEL_HEIGHT, avoidRect.y + avoidRect.height + panelGap + verticalOffset);
    return {
      x: Math.round(forcedSide.x),
      y: Math.round(forcedY),
      width: HOVER_PANEL_WIDTH,
      height: HOVER_PANEL_HEIGHT
    };
  }

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

  function getCustomizationAnchorRect(anchorRect = null) {
    if (anchorRect) {
      return anchorRect;
    }
    if (getCustomizationFrozenPetRect()) {
      return getCustomizationFrozenPetRect();
    }
    if (getTaskbarWalkRunway() && isTaskbarWalkActive()) {
      return getTaskbarWalkOverlayPetRect() || getPetSpriteRect() || getVisiblePetRect();
    }
    return getWindowRect(getPetWindow()) || getPetSpriteRect() || getVisiblePetRect();
  }

  function getCustomizationPosition(anchorRect = getCustomizationAnchorRectValue()) {
    const fullPetRect = getCustomizationAnchorRect(anchorRect);
    const petRect = getOverlayPlacementRect(fullPetRect);
    const avoidRect = expandRect(petRect, getScaledOverlayCollisionPadding());
    const panelGap = getOverlayVisualGap(0, HOVER_PANEL_SCALE_GAP_FACTOR);
    const rawArea = getOverlayWorkArea(avoidRect);
    const area = getOverlaySafeArea(rawArea, panelGap);
    const areaRight = area.x + area.width;
    const areaBottom = area.y + area.height;
    const verticalOffset = getOverlayVerticalOffset(0);
    const centeredX = petRect.x + Math.round((petRect.width - CUSTOMIZATION_PANEL_WIDTH) / 2);
    const sideY = petRect.y + Math.round((petRect.height - CUSTOMIZATION_PANEL_HEIGHT) / 2) + verticalOffset;

    const above = {
      x: clamp(centeredX, area.x, areaRight - CUSTOMIZATION_PANEL_WIDTH),
      y: Math.round(avoidRect.y - CUSTOMIZATION_PANEL_HEIGHT - panelGap + verticalOffset),
      width: CUSTOMIZATION_PANEL_WIDTH,
      height: CUSTOMIZATION_PANEL_HEIGHT
    };
    if (above.y >= area.y && !rectsOverlap(above, avoidRect)) {
      return above;
    }

    const right = {
      x: Math.round(avoidRect.x + avoidRect.width + panelGap),
      y: clamp(sideY, area.y, areaBottom - CUSTOMIZATION_PANEL_HEIGHT),
      width: CUSTOMIZATION_PANEL_WIDTH,
      height: CUSTOMIZATION_PANEL_HEIGHT
    };
    const left = {
      x: Math.round(avoidRect.x - CUSTOMIZATION_PANEL_WIDTH - panelGap),
      y: clamp(sideY, area.y, areaBottom - CUSTOMIZATION_PANEL_HEIGHT),
      width: CUSTOMIZATION_PANEL_WIDTH,
      height: CUSTOMIZATION_PANEL_HEIGHT
    };
    const rightFits = right.x + CUSTOMIZATION_PANEL_WIDTH <= areaRight && !rectsOverlap(right, avoidRect);
    const leftFits = left.x >= area.x && !rectsOverlap(left, avoidRect);
    if (rightFits && leftFits) {
      const rightSpace = areaRight - (avoidRect.x + avoidRect.width);
      const leftSpace = avoidRect.x - area.x;
      return rightSpace >= leftSpace ? right : left;
    } else if (rightFits) {
      return right;
    } else if (leftFits) {
      return left;
    }

    const below = {
      x: clamp(centeredX, area.x, areaRight - CUSTOMIZATION_PANEL_WIDTH),
      y: Math.round(avoidRect.y + avoidRect.height + panelGap + verticalOffset),
      width: CUSTOMIZATION_PANEL_WIDTH,
      height: CUSTOMIZATION_PANEL_HEIGHT
    };
    if (below.y + CUSTOMIZATION_PANEL_HEIGHT <= areaBottom && !rectsOverlap(below, avoidRect)) {
      return below;
    }

    const preferred = {
      x: Math.round(above.x),
      y: Math.round(above.y),
      width: CUSTOMIZATION_PANEL_WIDTH,
      height: CUSTOMIZATION_PANEL_HEIGHT
    };
    const fallbackCandidates = [above, right, left, below]
      .map((candidate) => {
        const rounded = {
          x: Math.round(candidate.x),
          y: Math.round(candidate.y),
          width: CUSTOMIZATION_PANEL_WIDTH,
          height: CUSTOMIZATION_PANEL_HEIGHT
        };
        const clamped = clampPanelRect(rounded, area, CUSTOMIZATION_PANEL_WIDTH, CUSTOMIZATION_PANEL_HEIGHT);
        const shift = Math.abs(clamped.x - rounded.x) + Math.abs(clamped.y - rounded.y);
        return { rect: clamped, shift };
      })
      .filter((entry) => !rectsOverlap(entry.rect, avoidRect));
    if (fallbackCandidates.length > 0) {
      return pickBestOverlayCandidate(
        fallbackCandidates,
        preferred,
        area,
        rawArea,
        Math.max(8, Math.round(panelGap * 0.45))
      );
    }

    return clampPanelRect(preferred, area, CUSTOMIZATION_PANEL_WIDTH, CUSTOMIZATION_PANEL_HEIGHT);
  }

  return {
    getOverlayWorkArea,
    getOverlayPlacementRect,
    getMenuHeadAnchorRect,
    getMenuAnchorRect,
    getHoverAnchorRect,
    getOverlayScaleDelta,
    getOverlayVisualGap,
    getHoverBodyHitPaddingForState,
    getOverlayVerticalOffset,
    getMenuVerticalLift,
    getHoverHitRect,
    getOverlayAvoidRect,
    getHoverAvoidRect,
    getMenuPlacementArea,
    getMenuCandidateGaps,
    getMenuPosition,
    getHoverPosition,
    getOverlaySafeArea,
    getCustomizationAnchorRect,
    getCustomizationPosition,
    clampPanelRect,
    pickBestOverlayCandidate
  };
}

module.exports = { createOverlayGeometry };
