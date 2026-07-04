// 宠物窗口渲染模块：负责主宠物窗口的帧播放、拖拽、缩放、状态切换、行走步进。
// 从 renderer.js 提取，通过 <script> 标签在 index.html 中按顺序加载。
// 依赖 shared.js 提供的全局变量（app、mode、WALK_DIAGNOSTICS_ENABLED）
// 与公共函数（logWalkDiagnostic、logWalkStepDiagnostic）。

async function renderPetWindow() {
  const config = await window.desktopPet.getPetConfig();
  let activeState = config.activeState || config.defaultState || config.states[0]?.id || "";
  let direction = -1;
  let scale = config.scale || { windowWidth: 180, windowHeight: 180, spriteSize: 128 };
  let frameStep = 0;
  let isDragging = false;
  let isInteractionPaused = false;
  let localDragging = false;
  let pointerDown = null;
  let completedOneShotState = "";
  let animationEpoch = 0;
  let walkStepInFlight = false;
  let walkFailureCount = 0;
  let lastRenderedFrameKey = "";
  let lastRenderedFrameSentAt = 0;
  let lastRenderedFrameDirection = direction;
  let sleepStageFrameReported = false;
  let rafHandle = 0;
  let tickAccumulator = 0;
  let lastTickAt = performance.now();
  let lastAnimationSkipLogAt = 0;
  let stateChangeToken = 0;
  const decodedStates = new Set();
  const decodingStates = new Map();
  const MOVING_FRAME_REPORT_INTERVAL_MS = 50;
  const EYE_LOOK_STEP_MS = 40;
  const SLEEP_WAKE_CLICK_MAX_MS = 350;
  const SLEEP_WAKE_CLICK_MAX_DISTANCE = 6;
  const SQUAT_SOUND_CHANCE = 0.5;
  const eyeTrackingFrames = config.eyeTrackingFrames || {};
  const directionEyeLooks = Object.keys(eyeTrackingFrames)
    .filter((look) => /^frame_\d+$/.test(look))
    .sort((a, b) => Number(a.slice(6)) - Number(b.slice(6)));
  const EYE_LOOK_ORDER = directionEyeLooks.length > 0
    ? directionEyeLooks
    : ["left", "up-left", "up", "up-right", "right", "down-right", "down", "down-left"];
  let targetEyeLook = "off";
  let currentEyeLook = "off";
  let lastEyeLookStepAt = 0;
  let squatSound = null;
  let sleepSound = null;
  let sleepStageSoundPlayed = false;
  const squatSounds = Array.isArray(config.squatSounds) ? config.squatSounds : [];
  const sleepSounds = Array.isArray(config.sleepSounds) ? config.sleepSounds : [];
  const walkDiagnosticsEnabled = Boolean(config.walkDiagnosticsEnabled);

  function logAnimationDiagnostic(message) {
    if (walkDiagnosticsEnabled && window.desktopPet.rendererDiagnostic) {
      window.desktopPet.rendererDiagnostic(message);
    }
  }

  const frameCache = window.createPetFrameCache
    ? window.createPetFrameCache({ ImageCtor: window.Image })
    : null;

  function getStateFrameIndex(state) {
    if (!state || state.frames.length === 0) {
      return 0;
    }
    const frameSequence = getStateFrameSequence(state);
    const stepCount = Math.max(1, frameSequence.length);
    const tailLoopStart = Number.isInteger(state.tailLoopStart) ? state.tailLoopStart : null;
    const shouldLoopFrames = !state.oneShot || state.moving;
    const step = tailLoopStart !== null && frameStep >= stepCount
      ? tailLoopStart + ((frameStep - tailLoopStart) % Math.max(1, stepCount - tailLoopStart))
      : shouldLoopFrames
        ? frameStep % stepCount
        : Math.min(frameStep, stepCount - 1);
    return frameSequence[step] ?? 0;
  }

  function isSleepStage() {
    const state = getState();
    return activeState === config.actionIds?.sleep
      || activeState === config.actionIds?.yawn
      && Number.isInteger(state?.tailLoopStart)
      && getStateFrameIndex(state) >= state.tailLoopStart;
  }

  function getStateFrameSequence(state) {
    if (!state) {
      return [];
    }
    if (Array.isArray(state._frameSequence)) {
      return state._frameSequence;
    }

    const frameCount = Array.isArray(state.frames) ? state.frames.length : 0;
    const maxFrame = Math.max(0, frameCount - 1);
    const rawLoopStart = Number.isInteger(state.loopStart) ? state.loopStart : 0;
    const rawLoopEnd = Number.isInteger(state.loopEnd) ? state.loopEnd : maxFrame;
    const loopStart = Math.min(Math.max(0, rawLoopStart), maxFrame);
    const loopEnd = Math.min(Math.max(loopStart, rawLoopEnd), maxFrame);
    const sequence = [];

    function appendRange(start, end, times = 1) {
      const repeatTimes = Math.max(1, Number.isInteger(times) ? times : 1);
      const from = Math.min(Math.max(0, start), maxFrame);
      const to = Math.min(Math.max(0, end), maxFrame);
      const direction = to >= from ? 1 : -1;
      for (let pass = 0; pass < repeatTimes; pass += 1) {
        for (let frameIndex = from; ; frameIndex += direction) {
          sequence.push(frameIndex);
          if (frameIndex === to) {
            break;
          }
        }
      }
    }

    if (Array.isArray(state.frameSequence)) {
      for (const segment of state.frameSequence) {
        if (!segment || !Number.isInteger(segment.start) || !Number.isInteger(segment.end)) {
          continue;
        }
        appendRange(segment.start, segment.end, segment.times);
      }
      const repeatCount = Number.isInteger(state.sequenceRepeatCount) ? Math.max(1, state.sequenceRepeatCount) : 1;
      if (repeatCount > 1 && sequence.length > 0) {
        const baseSequence = sequence.slice();
        sequence.push(...baseSequence);
      }
      state._frameSequence = sequence.length > 0 ? sequence : [0];
      return state._frameSequence;
    }

    for (let index = loopStart; index <= loopEnd; index += 1) {
      sequence.push(index);
    }

    const repeat = state.frameSequence || {};
    const repeatCount = Number.isInteger(repeat.repeatCount) ? repeat.repeatCount : 1;
    const repeatStart = Number.isInteger(repeat.repeatRangeStart) ? repeat.repeatRangeStart : null;
    const repeatEnd = Number.isInteger(repeat.repeatRangeEnd) ? repeat.repeatRangeEnd : null;
    if (repeatCount > 1 && repeatStart !== null && repeatEnd !== null) {
      const start = Math.min(Math.max(loopStart, repeatStart), loopEnd);
      const end = Math.min(Math.max(start, repeatEnd), loopEnd);
      const tailIndex = sequence.findLastIndex((frameIndex) => frameIndex === end);
      const extra = [];
      for (let pass = 1; pass < repeatCount; pass += 1) {
        for (let frameIndex = start; frameIndex <= end; frameIndex += 1) {
          extra.push(frameIndex);
        }
      }
      if (tailIndex >= 0 && extra.length > 0) {
        sequence.splice(tailIndex + 1, 0, ...extra);
      }
    }

    state._frameSequence = sequence.length > 0 ? sequence : [0];
    return state._frameSequence;
  }

  if (frameCache) {
    for (const state of config.states) {
      frameCache.preloadFrames(state.frames);
    }
    frameCache.preloadFrames(Object.values(eyeTrackingFrames));
  } else {
    for (const state of config.states) {
      for (const frame of state.frames) {
        const preload = new Image();
        preload.src = frame;
      }
    }
    for (const frame of Object.values(eyeTrackingFrames)) {
      const preload = new Image();
      preload.src = frame;
    }
  }

  app.className = "pet-stage";

  const spriteHost = document.createElement("div");
  spriteHost.className = "pet-sprite-host";
  const img = document.createElement("img");
  img.className = "pet-sprite";
  img.alt = "Desktop pet";
  img.draggable = false;
  spriteHost.appendChild(img);
  app.appendChild(spriteHost);

  function applyScale(nextScale) {
    scale = nextScale || scale;
    const layout = frameCache?.buildResponsiveScaleLayout
      ? frameCache.buildResponsiveScaleLayout(scale)
      : window.buildResponsiveScaleLayout?.(scale);
    if (!layout) {
      return;
    }
    app.style.width = layout.appWidth;
    app.style.height = layout.appHeight;
    spriteHost.style.left = layout.hostLeft;
    spriteHost.style.width = layout.hostWidth;
    spriteHost.style.height = layout.hostHeight;
    spriteHost.style.transform = "";
    img.style.width = layout.imageWidth;
    img.style.height = layout.imageHeight;
  }

  app.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || !event.target.closest(".pet-sprite")) {
      return;
    }
    event.preventDefault();
    pointerDown = {
      at: performance.now(),
      screenX: event.screenX,
      screenY: event.screenY,
      clientX: event.clientX,
      clientY: event.clientY,
      sleep: isSleepStage()
    };
  });

  window.addEventListener("mousemove", (event) => {
    if (!localDragging && !pointerDown) {
      return;
    }
    if (!localDragging && pointerDown) {
      if (Math.hypot(event.screenX - pointerDown.screenX, event.screenY - pointerDown.screenY) <= SLEEP_WAKE_CLICK_MAX_DISTANCE) {
        return;
      }
      localDragging = true;
      window.desktopPet.dragStart(pointerDown);
    }
    if ((event.buttons & 1) === 0) {
      pointerDown = null;
      localDragging = false;
      window.desktopPet.dragEnd();
    }
  });

  window.addEventListener("mouseup", (event) => {
    const down = pointerDown;
    pointerDown = null;
    if (!localDragging) {
      if (
        down?.sleep
        && event.target.closest(".pet-sprite")
        && performance.now() - down.at <= SLEEP_WAKE_CLICK_MAX_MS
        && Math.hypot(event.screenX - down.screenX, event.screenY - down.screenY) <= SLEEP_WAKE_CLICK_MAX_DISTANCE
      ) {
        event.preventDefault();
        window.desktopPet.wakeSleepingPet();
      }
      if (
        !down?.sleep
        && event.target.closest(".pet-sprite")
        && performance.now() - down.at <= SLEEP_WAKE_CLICK_MAX_MS
        && Math.hypot(event.screenX - down.screenX, event.screenY - down.screenY) <= SLEEP_WAKE_CLICK_MAX_DISTANCE
      ) {
        const nextState = pickRandomClickAction();
        if (nextState) {
          event.preventDefault();
          window.desktopPet.setState(nextState, { suppressHover: true });
        }
      }
      return;
    }
    localDragging = false;
    window.desktopPet.dragEnd();
  });

  app.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    window.desktopPet.showPetMenu();
  });

  app.addEventListener("wheel", (event) => {
    if (!event.target.closest(".pet-sprite")) {
      return;
    }
    event.preventDefault();
    window.desktopPet.adjustScale(event.deltaY);
  }, { passive: false });

  img.addEventListener("mouseenter", () => {
    if (localDragging || isDragging) {
      return;
    }
    window.desktopPet.hoverEnter();
  });

  img.addEventListener("mouseleave", () => {
    window.desktopPet.hoverLeave();
  });

  function getState() {
    return config.states.find((state) => state.id === activeState) || config.states[0];
  }

  function getStateById(stateId) {
    return config.states.find((state) => state.id === stateId) || config.states[0];
  }

  function pickRandomClickAction() {
    const actionOrder = Array.isArray(config.actionOrder) && config.actionOrder.length
      ? config.actionOrder
      : config.states.map((state) => state.id);
    const availableStates = new Set(config.states.map((state) => state.id));
    const candidates = actionOrder.filter((stateId) => stateId && stateId !== activeState && availableStates.has(stateId));
    if (candidates.length === 0) {
      return "";
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function getFirstFrameForState(state) {
    if (!state || !Array.isArray(state.frames) || state.frames.length === 0) {
      return "";
    }
    const frameSequence = getStateFrameSequence(state);
    const firstFrameIndex = frameSequence[0] ?? 0;
    return state.frames[firstFrameIndex] || state.frames[0] || "";
  }

  function stopSquatSound() {
    if (!squatSound) {
      return;
    }
    squatSound.pause();
    squatSound.currentTime = 0;
    squatSound = null;
  }

  function stopSleepSound() {
    if (!sleepSound) {
      return;
    }
    sleepSound.pause();
    sleepSound.currentTime = 0;
    sleepSound = null;
  }

  function maybePlaySquatSound(previousState, nextState) {
    if (nextState !== config.defaultState || previousState === nextState || squatSounds.length === 0 || Math.random() >= SQUAT_SOUND_CHANCE) {
      return;
    }
    stopSquatSound();
    squatSound = new Audio(squatSounds[Math.floor(Math.random() * squatSounds.length)]);
    squatSound.play().catch(() => {});
  }

  function playSleepSound() {
    stopSleepSound();
    if (sleepSounds.length === 0) {
      return;
    }
    sleepSound = new Audio(sleepSounds[Math.floor(Math.random() * sleepSounds.length)]);
    sleepSound.addEventListener("ended", () => {
      sleepSound = null;
    }, { once: true });
    sleepSound.play().catch(() => {});
  }

  function updateSleepStageSound() {
    const sleeping = isSleepStage();
    if (sleeping && !sleepStageSoundPlayed) {
      stopSquatSound();
      playSleepSound();
      sleepStageSoundPlayed = true;
    } else if (!sleeping) {
      sleepStageSoundPlayed = false;
    }
  }

  function getNextEyeLook(current, target) {
    const currentIndex = EYE_LOOK_ORDER.indexOf(current);
    const targetIndex = EYE_LOOK_ORDER.indexOf(target);
    if (currentIndex < 0 || targetIndex < 0) {
      return target;
    }

    const forward = (targetIndex - currentIndex + EYE_LOOK_ORDER.length) % EYE_LOOK_ORDER.length;
    const backward = (currentIndex - targetIndex + EYE_LOOK_ORDER.length) % EYE_LOOK_ORDER.length;
    const direction = forward <= backward ? 1 : -1;
    const distance = Math.min(forward, backward);
    const step = Math.min(distance, 3);
    return EYE_LOOK_ORDER[(currentIndex + direction * step + EYE_LOOK_ORDER.length) % EYE_LOOK_ORDER.length];
  }

  function getEyeTrackingFrame(state) {
    if (state?.id !== config.defaultState || targetEyeLook === "off" || !eyeTrackingFrames[targetEyeLook]) {
      currentEyeLook = "off";
      return "";
    }

    const now = performance.now();
    if (currentEyeLook === "off" || !eyeTrackingFrames[currentEyeLook]) {
      currentEyeLook = targetEyeLook;
    }
    if (currentEyeLook !== targetEyeLook && now - lastEyeLookStepAt >= EYE_LOOK_STEP_MS) {
      currentEyeLook = getNextEyeLook(currentEyeLook, targetEyeLook);
      lastEyeLookStepAt = now;
    }

    return eyeTrackingFrames[currentEyeLook] || "";
  }

  async function decodeStateFrames(state) {
    if (!state || decodedStates.has(state.id)) {
      return true;
    }
    if (decodingStates.has(state.id)) {
      return decodingStates.get(state.id);
    }

    const startedAt = performance.now();
    const decodePromise = (frameCache
      ? frameCache.ensureFramesReady(state.frames)
      : Promise.all(state.frames.map((frame) => new Promise((resolve) => {
        const image = new Image();
        image.onload = async () => {
          try {
            if (image.decode) {
              await image.decode();
            }
          } catch {
            // A decoded frame is a performance hint; a failed decode should not block the pet.
          }
          resolve();
        };
        image.onerror = () => resolve();
        image.src = frame;
      })))
    ).then(() => {
      decodedStates.add(state.id);
      decodingStates.delete(state.id);
      logAnimationDiagnostic(`decode state=${state.id} frames=${state.frames.length} elapsedMs=${Math.round(performance.now() - startedAt)}`);
      return true;
    });
    decodingStates.set(state.id, decodePromise);
    return decodePromise;
  }

  function commitStateChange(previousState, state, nextState) {
    activeState = state;
    if ((previousState === config.actionIds?.yawn || previousState === config.actionIds?.sleep) && state !== previousState) {
      stopSleepSound();
    }
    if (state !== config.defaultState) {
      stopSquatSound();
    } else {
      maybePlaySquatSound(previousState, state);
    }
    frameStep = previousState === config.actionIds?.sleep && state === config.actionIds?.yawn && Number.isInteger(nextState?.tailLoopStart)
      ? nextState.tailLoopStart
      : 0;
    completedOneShotState = "";
    animationEpoch += 1;
    walkFailureCount = 0;
    tickAccumulator = 0;
    lastTickAt = performance.now();
    lastRenderedFrameKey = "";
    lastRenderedFrameSentAt = 0;
    lastRenderedFrameDirection = direction;
    sleepStageFrameReported = false;
    img.style.willChange = nextState?.moving ? "transform" : "";
    if (nextState?.moving) {
      decodeStateFrames(nextState);
    }
    renderFrame();
    restartAnimationTimer();
  }

  function switchStateWhenFirstFrameReady(state) {
    const previousState = activeState;
    const nextState = getStateById(state);
    const firstFrame = getFirstFrameForState(nextState);
    const token = ++stateChangeToken;
    logAnimationDiagnostic(`state-change from=${previousState} to=${state}`);
    if (!frameCache || !firstFrame || frameCache.isFrameReady(firstFrame)) {
      commitStateChange(previousState, state, nextState);
      return;
    }

    frameCache.ensureFrameReady(firstFrame).then((result) => {
      if (token !== stateChangeToken) {
        return;
      }
      if (!result.ready) {
        logAnimationDiagnostic(`state-first-frame-fallback state=${state}`);
      }
      commitStateChange(previousState, state, nextState);
    });
  }

  function renderFrame() {
    const state = getState();
    if (!state || state.frames.length === 0) {
      return;
    }

    const frameIndex = getStateFrameIndex(state);
    const frame = state.frames[frameIndex] || state.frames[0];
    const sleeping = isSleepStage();
    updateSleepStageSound();
    const eyeFrame = getEyeTrackingFrame(state);
    const renderedFrame = eyeFrame || frame;
    const shouldMirror = state.defaultFacing === "left" ? direction > 0 : direction < 0;
    const transform = shouldMirror ? "scaleX(-1)" : "scaleX(1)";
    if (img.src !== renderedFrame) {
      img.src = renderedFrame;
    }
    if (img.style.transform !== transform) {
      img.style.transform = transform;
    }
    const renderedKey = `${state.id}:${frameIndex}:${direction}:${eyeFrame ? currentEyeLook : ""}`;
    const shouldReportSleepStage = sleeping && !sleepStageFrameReported;
    if (renderedKey !== lastRenderedFrameKey || shouldReportSleepStage) {
      const now = performance.now();
      const directionChanged = direction !== lastRenderedFrameDirection;
      const shouldReportImmediately = !state.moving || directionChanged;
      if (shouldReportImmediately || shouldReportSleepStage || now - lastRenderedFrameSentAt >= MOVING_FRAME_REPORT_INTERVAL_MS) {
        lastRenderedFrameKey = renderedKey;
        lastRenderedFrameSentAt = now;
        lastRenderedFrameDirection = direction;
        sleepStageFrameReported = sleeping;
        window.desktopPet.updateRenderedFrame({
          state: state.id,
          frameIndex,
          direction
        });
      }
    }
    if (!sleeping) {
      sleepStageFrameReported = false;
    }
  }

  function maybeCompleteOneShot(state) {
    if (!state?.oneShot || state?.moving) {
      completedOneShotState = "";
      return false;
    }

    const stepCount = Math.max(1, getStateFrameSequence(state).length);
    if (frameStep < stepCount - 1 || completedOneShotState === state.id) {
      return false;
    }

    completedOneShotState = state.id;
    window.desktopPet.completeOneShot(state.id);
    return true;
  }

  function requestWalkStep(step, elapsedMs) {
    return window.desktopPet.advanceWalkStep(step, elapsedMs);
  }

  async function runAnimationTick(tickAt) {
    rafHandle = 0;
    const state = getState();
    const frameMs = Math.max(16, state?.frameMs || 30);
    const currentEpoch = animationEpoch;
    const deltaMs = Math.max(1, tickAt - lastTickAt);
    lastTickAt = tickAt;
    tickAccumulator = Math.min(frameMs * 4, tickAccumulator + deltaMs);

    if (tickAccumulator >= frameMs) {
      const elapsedMs = Math.max(1, tickAccumulator);
      tickAccumulator = 0;
      if (!isDragging && !isInteractionPaused) {
        if (state?.moving && !decodedStates.has(state.id)) {
          await decodeStateFrames(state);
          if (currentEpoch !== animationEpoch) {
            scheduleAnimationTick();
            return;
          }
        }

        if (state?.moving) {
          if (currentEpoch === animationEpoch) {
            frameStep += 1;
            renderFrame();
          }
          if (!walkStepInFlight) {
            walkStepInFlight = true;
            const stepStartedAt = performance.now();
            const requestEpoch = currentEpoch;
            requestWalkStep(frameStep, elapsedMs).then((result) => {
              logWalkStepDiagnostic(stepStartedAt, result, direction);
              if (requestEpoch !== animationEpoch) {
                return;
              }
              if (result?.completed || result?.paused || result?.moving === false) {
                return;
              }
              walkFailureCount = 0;
              if (result && result.state === activeState && Number.isFinite(result.direction)) {
                direction = result.direction;
                if (result.scale) {
                  applyScale(result.scale);
                }
                renderFrame();
              }
            }).catch(() => {
              walkFailureCount += 1;
              if (walkFailureCount >= 3 && activeState === state.id) {
                window.desktopPet.setState(config.defaultState || config.states[0]?.id || "");
              }
            }).finally(() => {
              walkStepInFlight = false;
            });
          }
        } else {
          if (currentEpoch === animationEpoch && !maybeCompleteOneShot(state)) {
            frameStep += 1;
          }
          if (currentEpoch === animationEpoch) {
            renderFrame();
          }
        }
      } else if (walkDiagnosticsEnabled && tickAt - lastAnimationSkipLogAt >= 250) {
        lastAnimationSkipLogAt = tickAt;
        logAnimationDiagnostic(`tick-skip state=${state?.id || ""} dragging=${isDragging} paused=${isInteractionPaused} frameStep=${frameStep}`);
      }
    }
    scheduleAnimationTick();
  }

  function scheduleAnimationTick() {
    if (rafHandle) {
      return;
    }
    rafHandle = window.requestAnimationFrame(runAnimationTick);
  }

  function restartAnimationTimer() {
    if (rafHandle) {
      window.cancelAnimationFrame(rafHandle);
      rafHandle = 0;
    }
    scheduleAnimationTick();
  }

  window.desktopPet.onStateChanged((state) => {
    switchStateWhenFirstFrameReady(state);
  });

  window.desktopPet.onDirectionChanged((nextDirection) => {
    if (getState()?.moving) {
      return;
    }
    direction = nextDirection;
    renderFrame();
  });

  window.desktopPet.onDragStateChanged((nextIsDragging) => {
    isDragging = Boolean(nextIsDragging);
    logAnimationDiagnostic(`drag-state dragging=${isDragging} state=${activeState} frameStep=${frameStep}`);
    renderFrame();
  });

  window.desktopPet.onPauseStateChanged((nextIsPaused) => {
    isInteractionPaused = Boolean(nextIsPaused);
    logAnimationDiagnostic(`pause-state paused=${isInteractionPaused} state=${activeState} frameStep=${frameStep}`);
    if (isSleepStage() && sleepSound) {
      if (isInteractionPaused) {
        sleepSound.pause();
      } else {
        sleepSound.play().catch(() => {});
      }
    }
    if (!isInteractionPaused) {
      tickAccumulator = 0;
      lastTickAt = performance.now();
    }
    renderFrame();
  });

  window.desktopPet.onEyeTrackingLook((look) => {
    targetEyeLook = typeof look === "string" ? look : "off";
    renderFrame();
  });

  window.desktopPet.onScaleChanged((nextScale) => {
    applyScale(nextScale);
  });

  applyScale(scale);
  if (frameCache) {
    const initialFrame = getFirstFrameForState(getState());
    if (initialFrame) {
      await frameCache.ensureFrameReady(initialFrame);
    }
  }
  renderFrame();
  restartAnimationTimer();
}
