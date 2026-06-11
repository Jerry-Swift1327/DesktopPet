const app = document.getElementById("app");
const mode = window.location.hash === "#menu"
  ? "menu"
  : window.location.hash === "#hover"
    ? "hover"
    : window.location.hash === "#bubble"
      ? "bubble"
      : "pet";
const WALK_DIAGNOSTICS_ENABLED = false;

function logWalkDiagnostic(message) {
  if (WALK_DIAGNOSTICS_ENABLED) {
    console.debug(`[walk-diagnostic] ${message}`);
  }
}

function logWalkStepDiagnostic(startedAt, result, direction) {
  if (!WALK_DIAGNOSTICS_ENABLED) {
    return;
  }
  logWalkDiagnostic(`step state=${result?.state || ""} direction=${result?.direction ?? direction} paused=${Boolean(result?.paused)} completed=${Boolean(result?.completed)} elapsedMs=${Math.round(performance.now() - startedAt)}`);
}

if (mode === "menu") {
  renderQuickMenuWindow();
} else if (mode === "hover") {
  renderHoverWindow();
} else if (mode === "bubble") {
  renderStartupBubbleWindow();
} else {
  renderPetWindow();
}

async function renderPetWindow() {
  const config = await window.desktopPet.getPetConfig();
  let activeState = config.activeState || config.defaultState || config.states[0]?.id || "";
  let direction = -1;
  let scale = config.scale || { windowWidth: 180, windowHeight: 180, spriteSize: 128 };
  let frameStep = 0;
  let isDragging = false;
  let isInteractionPaused = false;
  let localDragging = false;
  let completedOneShotState = "";
  let animationEpoch = 0;
  let walkStepInFlight = false;
  let walkFailureCount = 0;
  let lastRenderedFrameKey = "";
  let lastRenderedFrameSentAt = 0;
  let lastRenderedFrameDirection = direction;
  let rafHandle = 0;
  let tickAccumulator = 0;
  let lastTickAt = performance.now();
  const decodedStates = new Set();
  const decodingStates = new Map();
  const MOVING_FRAME_REPORT_INTERVAL_MS = 50;
  const EYE_LOOK_STEP_MS = 120;
  const EYE_LOOK_ORDER = ["left", "up-left", "up", "up-right", "right", "down-right", "down", "down-left"];
  const eyeTrackingFrames = config.eyeTrackingFrames || {};
  let targetEyeLook = "off";
  let currentEyeLook = "off";
  let lastEyeLookStepAt = 0;

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
    app.style.width = `${scale.windowWidth || 180}px`;
    app.style.height = `${scale.windowHeight || 180}px`;
    const spriteSize = scale.spriteSize || 128;
    const spriteOffsetX = Number.isFinite(scale.spriteOffsetX)
      ? Math.round(scale.spriteOffsetX)
      : Math.max(0, Math.round(((scale.windowWidth || 180) - spriteSize) / 2));
    spriteHost.style.width = `${spriteSize}px`;
    spriteHost.style.height = `${spriteSize}px`;
    spriteHost.style.transform = `translateX(${spriteOffsetX}px)`;
    img.style.width = `${spriteSize}px`;
    img.style.height = `${spriteSize}px`;
  }

  app.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || !event.target.closest(".pet-sprite")) {
      return;
    }
    event.preventDefault();
    localDragging = true;
    window.desktopPet.dragStart({
      screenX: event.screenX,
      screenY: event.screenY,
      clientX: event.clientX,
      clientY: event.clientY
    });
  });

  window.addEventListener("mousemove", (event) => {
    if (!localDragging) {
      return;
    }
    if ((event.buttons & 1) === 0) {
      localDragging = false;
      window.desktopPet.dragEnd();
    }
  });

  window.addEventListener("mouseup", () => {
    if (!localDragging) {
      return;
    }
    localDragging = false;
    window.desktopPet.dragEnd();
  });

  app.addEventListener("dblclick", () => {
    window.desktopPet.interact();
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

  function getNextEyeLook(current, target) {
    if (target === "center" || current === "center") {
      return target;
    }

    const currentIndex = EYE_LOOK_ORDER.indexOf(current);
    const targetIndex = EYE_LOOK_ORDER.indexOf(target);
    if (currentIndex < 0 || targetIndex < 0) {
      return target;
    }

    const forward = (targetIndex - currentIndex + EYE_LOOK_ORDER.length) % EYE_LOOK_ORDER.length;
    const backward = (currentIndex - targetIndex + EYE_LOOK_ORDER.length) % EYE_LOOK_ORDER.length;
    const step = forward <= backward ? 1 : -1;
    return EYE_LOOK_ORDER[(currentIndex + step + EYE_LOOK_ORDER.length) % EYE_LOOK_ORDER.length];
  }

  function getEyeTrackingFrame(state) {
    if (state?.id !== config.defaultState || targetEyeLook === "off" || !eyeTrackingFrames[targetEyeLook]) {
      currentEyeLook = "off";
      return "";
    }

    const now = performance.now();
    if (currentEyeLook === "off" || !eyeTrackingFrames[currentEyeLook]) {
      currentEyeLook = eyeTrackingFrames.center ? "center" : targetEyeLook;
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

    const decodePromise = Promise.all(state.frames.map((frame) => new Promise((resolve) => {
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
    }))).then(() => {
      decodedStates.add(state.id);
      decodingStates.delete(state.id);
      return true;
    });
    decodingStates.set(state.id, decodePromise);
    return decodePromise;
  }

  function renderFrame() {
    const state = getState();
    if (!state || state.frames.length === 0) {
      return;
    }

    const frameSequence = getStateFrameSequence(state);
    const stepCount = Math.max(1, frameSequence.length);
    const shouldLoopFrames = !state.oneShot || state.moving;
    const step = shouldLoopFrames ? frameStep % stepCount : Math.min(frameStep, stepCount - 1);
    const frameIndex = frameSequence[step] ?? 0;
    const frame = state.frames[frameIndex] || state.frames[0];
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
    if (renderedKey !== lastRenderedFrameKey) {
      const now = performance.now();
      const directionChanged = direction !== lastRenderedFrameDirection;
      const shouldReportImmediately = !state.moving || directionChanged;
      if (shouldReportImmediately || now - lastRenderedFrameSentAt >= MOVING_FRAME_REPORT_INTERVAL_MS) {
        lastRenderedFrameKey = renderedKey;
        lastRenderedFrameSentAt = now;
        lastRenderedFrameDirection = direction;
        window.desktopPet.updateRenderedFrame({
          state: state.id,
          frameIndex,
          direction
        });
      }
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
    activeState = state;
    frameStep = 0;
    completedOneShotState = "";
    animationEpoch += 1;
    walkFailureCount = 0;
    tickAccumulator = 0;
    lastTickAt = performance.now();
    lastRenderedFrameKey = "";
    lastRenderedFrameSentAt = 0;
    lastRenderedFrameDirection = direction;
    const nextState = getState();
    img.style.willChange = nextState?.moving ? "transform" : "";
    if (nextState?.moving) {
      decodeStateFrames(nextState);
    }
    renderFrame();
    restartAnimationTimer();
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
    renderFrame();
  });

  window.desktopPet.onPauseStateChanged((nextIsPaused) => {
    isInteractionPaused = Boolean(nextIsPaused);
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
  renderFrame();
  restartAnimationTimer();
}

async function renderStartupBubbleWindow() {
  let config = await window.desktopPet.getPetConfig();
  app.className = "bubble-stage";
  const bubble = document.createElement("div");
  bubble.className = "pet-bubble is-visible";
  bubble.setAttribute("role", "status");
  bubble.setAttribute("aria-live", "polite");
  app.appendChild(bubble);

  function pickGreeting(state) {
    const greetings = Array.isArray(state?.greetings) ? state.greetings.filter(Boolean) : [];
    if (greetings.length === 0) {
      return "我在这里，随时待命。";
    }

    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  function updateBubble() {
    const defaultState = config.states.find((state) => state.id === config.defaultState) || config.states[0];
    bubble.textContent = config.message || pickGreeting(defaultState);
    window.requestAnimationFrame(() => {
      const width = Math.ceil(bubble.scrollWidth + 2);
      const height = Math.ceil(bubble.getBoundingClientRect().height + 12);
      window.desktopPet.resizeBubble({ width, height });
    });
  }

  window.desktopPet.onBubbleData((nextConfig) => {
    config = nextConfig || config;
    updateBubble();
  });

  updateBubble();
}

async function renderQuickMenuWindow() {
  let config = await window.desktopPet.getPetConfig();
  const showWindowRoam = Boolean(config.features?.windowRoam);
  const showAutoStart = Boolean(config.features?.autoStart);
  const showEyeTracking = Boolean(config.features?.eyeTracking);
  const windowRoamButton = showWindowRoam ? `
      <button type="button" class="quick-menu__item" data-command="window-roam" data-window-roam>
        <span class="quick-menu__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M4.5 7.5h15"></path><path d="M6.5 7.5v9a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-9"></path><path d="M9 14h6"></path><path d="m12 11 3 3-3 3"></path></svg>
        </span>
        <span>窗口跟随</span>
        <span class="quick-menu__check" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M5 12.5 9.2 16.7 19 6.8"></path></svg>
        </span>
      </button>` : "";
  const autoStartButton = showAutoStart ? `
      <button type="button" class="quick-menu__item" data-command="auto-start" data-auto-start>
        <span class="quick-menu__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3v10"></path><path d="m8 9 4 4 4-4"></path><path d="M5 14.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3.5"></path></svg>
        </span>
        <span>自动开机</span>
        <span class="quick-menu__check" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M5 12.5 9.2 16.7 19 6.8"></path></svg>
        </span>
      </button>` : "";
  const eyeTrackingButton = showEyeTracking ? `
      <button type="button" class="quick-menu__item" data-command="eye-tracking" data-eye-tracking>
        <span class="quick-menu__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.8"></circle></svg>
        </span>
        <span>眼神追踪</span>
        <span class="quick-menu__check" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M5 12.5 9.2 16.7 19 6.8"></path></svg>
        </span>
      </button>` : "";

  app.className = "menu-stage";
  app.innerHTML = `
    <section class="quick-menu" aria-label="桌宠功能菜单" data-quick-menu>
      <button type="button" class="quick-menu__item" data-command="reset">
        <span class="quick-menu__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M3 10.8 12 3.8l9 7"></path><path d="M5.8 9.9V20h12.4V9.9"></path><path d="M10 20v-5.2h4V20"></path></svg>
        </span>
        <span>回到起始点</span>
      </button>
${windowRoamButton}
      <button type="button" class="quick-menu__item" data-command="top">
        <span class="quick-menu__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M14.7 4.2 19.8 9.3"></path><path d="M7.2 13.5 4.8 16l3.2 3.2 2.5-2.4"></path><path d="M8.2 12.5 15 5.8l3.2 3.2-6.7 6.8"></path><path d="M12.5 15.8 9 12.3"></path></svg>
        </span>
        <span>重置大小</span>
      </button>
${autoStartButton}
${eyeTrackingButton}
      <button type="button" class="quick-menu__item quick-menu__item--danger" data-command="quit">
        <span class="quick-menu__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3.8v8"></path><path d="M7.2 6.8a8 8 0 1 0 9.6 0"></path></svg>
        </span>
        <span>退出程序</span>
      </button>
    </section>
  `;

  const menuElement = app.querySelector("[data-quick-menu]");

  app.addEventListener("mouseenter", () => {
    window.desktopPet.menuPanelEnter();
  });

  app.addEventListener("mouseleave", () => {
    window.desktopPet.menuPanelLeave();
  });

  function reportMenuHeight() {
    window.requestAnimationFrame(() => {
      const height = Math.ceil(menuElement.getBoundingClientRect().height);
      window.desktopPet.resizeMenu(height);
    });
  }

  function updateAutoStartState() {
    const autoStart = config.autoStart || {};
    const button = app.querySelector("[data-auto-start]");
    if (!button) {
      return;
    }

    button.classList.toggle("is-active", Boolean(autoStart.enabled));
    button.disabled = !autoStart.canToggle;
    button.title = autoStart.error || "";
  }

  function updateWindowRoamState() {
    const windowRoam = config.windowRoam || {};
    const button = app.querySelector("[data-window-roam]");
    if (!button) {
      return;
    }

    button.classList.toggle("is-active", Boolean(windowRoam.enabled));
    button.disabled = !windowRoam.canToggle;
    button.title = windowRoam.error || "";
  }

  function updateEyeTrackingState() {
    const eyeTracking = config.eyeTracking || {};
    const button = app.querySelector("[data-eye-tracking]");
    if (!button) {
      return;
    }

    button.classList.toggle("is-active", Boolean(eyeTracking.enabled));
    button.disabled = !eyeTracking.canToggle;
    button.title = eyeTracking.error || "";
  }

  app.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  app.addEventListener("click", async (event) => {
    const target = event.target.closest("button");
    if (!target) {
      return;
    }

    if (target.dataset.command === "reset") {
      window.desktopPet.resetPosition();
      window.desktopPet.hideMenu();
      return;
    }

    if (target.dataset.command === "reset-scale" || target.dataset.command === "top") {
      window.desktopPet.resetScale();
      window.desktopPet.hideMenu();
      return;
    }

    if (target.dataset.command === "auto-start") {
      const previousAutoStart = config.autoStart || {};
      const nextEnabled = !Boolean(previousAutoStart.enabled);
      config = {
        ...config,
        autoStart: {
          ...previousAutoStart,
          error: "",
          enabled: nextEnabled
        }
      };
      updateAutoStartState();
      window.setTimeout(() => window.desktopPet.hideMenu(), 1000);
      window.desktopPet.setAutoStart(nextEnabled).then((autoStart) => {
        config = {
          ...config,
          autoStart
        };
        updateAutoStartState();
      }).catch(() => {
        config = {
          ...config,
          autoStart: previousAutoStart
        };
        updateAutoStartState();
      });
      return;
    }

    if (target.dataset.command === "window-roam") {
      const previousWindowRoam = config.windowRoam || {};
      const nextEnabled = !Boolean(previousWindowRoam.enabled);
      config = {
        ...config,
        windowRoam: {
          ...previousWindowRoam,
          error: "",
          enabled: nextEnabled
        }
      };
      updateWindowRoamState();
      window.setTimeout(() => {
        window.desktopPet.hideMenu();
        window.desktopPet.setWindowRoam(nextEnabled).then((windowRoam) => {
          config = {
            ...config,
            windowRoam
          };
          updateWindowRoamState();
        }).catch(() => {
          config = {
            ...config,
            windowRoam: previousWindowRoam
          };
          updateWindowRoamState();
        });
      }, 1000);
      return;
    }

    if (target.dataset.command === "eye-tracking") {
      const previousEyeTracking = config.eyeTracking || {};
      const nextEnabled = !Boolean(previousEyeTracking.enabled);
      config = {
        ...config,
        eyeTracking: {
          ...previousEyeTracking,
          error: "",
          enabled: nextEnabled
        }
      };
      updateEyeTrackingState();
      window.setTimeout(() => {
        window.desktopPet.hideMenu();
        window.desktopPet.setEyeTracking(nextEnabled).then((eyeTracking) => {
          config = {
            ...config,
            eyeTracking
          };
          updateEyeTrackingState();
        }).catch(() => {
          config = {
            ...config,
            eyeTracking: previousEyeTracking
          };
          updateEyeTrackingState();
        });
      }, 1000);
      return;
    }

    if (target.dataset.command === "quit") {
      window.desktopPet.quit();
    }
  });

  window.desktopPet.onMenuData((nextConfig) => {
    config = nextConfig || config;
    updateAutoStartState();
    updateWindowRoamState();
    updateEyeTrackingState();
    reportMenuHeight();
  });

  updateAutoStartState();
  updateWindowRoamState();
  updateEyeTrackingState();
  reportMenuHeight();
}

async function renderHoverWindow() {
  let config = await window.desktopPet.getPetConfig();
  let stats = config.stats || { companionshipDays: 1, todayInteractions: 0, intimacy: 50, fullness: 50, health: 100, maxValue: 100 };
  let activeState = config.activeState || config.defaultState || config.states[0]?.id || "";
  let timerSnapshotAt = Date.now();
  let actionIds = config.actionIds || {};
  let preferredActions = Array.isArray(config.actionOrder) && config.actionOrder.length
    ? config.actionOrder
    : config.states.map((state) => state.id);

  app.className = config.channelConfig?.showDebugTimers === false
    ? "hover-stage hover-stage--compact"
    : "hover-stage";
  app.style.setProperty("--hover-panel-height", `${config.channelConfig?.hoverPanelHeight || 180}px`);
  app.innerHTML = `
    <section class="hover-panel" aria-label="宠物状态">
      <header class="hover-panel__header">
        <strong data-stat="days">陪伴 1 天</strong>
        <span data-stat="interactions">今日 0 次互动</span>
      </header>
      <div class="hover-panel__meter">
        <span class="hover-panel__symbol hover-panel__symbol--heart"></span>
        <span class="hover-panel__label">亲密度</span>
        <span class="hover-panel__bar"><span data-meter="intimacy" style="width: 50%"></span></span>
        <span class="hover-panel__value" data-value="intimacy">50</span>
      </div>
      <div class="hover-panel__meter">
        <span class="hover-panel__symbol hover-panel__symbol--food"></span>
        <span class="hover-panel__label">饱食度</span>
        <span class="hover-panel__bar hover-panel__bar--gold"><span data-meter="fullness" style="width: 50%"></span></span>
        <span class="hover-panel__value" data-value="fullness">50</span>
      </div>
      <div class="hover-panel__meter">
        <span class="hover-panel__symbol hover-panel__symbol--energy"></span>
        <span class="hover-panel__label">健康度</span>
        <span class="hover-panel__bar hover-panel__bar--green"><span data-meter="health" style="width: 100%"></span></span>
        <span class="hover-panel__value" data-value="health">100</span>
      </div>
      <div class="hover-panel__timers" data-debug-timers ${config.channelConfig?.showDebugTimers === false ? "hidden" : ""}>
        <span data-timer="idle">Idle 10:00</span>
        <span data-timer="intimacy">Love 30:00</span>
        <span data-timer="walk">Walk 00:00</span>
      </div>
      <div class="hover-panel__actions" data-hover-actions></div>
    </section>
  `;

  const actionList = app.querySelector("[data-hover-actions]");

  app.addEventListener("mouseenter", () => {
    window.desktopPet.hoverPanelEnter();
  });

  app.addEventListener("mouseleave", () => {
    window.desktopPet.hoverPanelLeave();
  });

  function renderActions() {
    actionList.replaceChildren();
    for (const stateId of preferredActions) {
      const state = config.states.find((item) => item.id === stateId);
      if (!state) {
        continue;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hover-panel__action";
      button.dataset.state = state.id;
      button.textContent = state.label;
      actionList.appendChild(button);
    }
  }

  app.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  app.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target || !target.dataset.state) {
      return;
    }
    if (target.disabled) {
      return;
    }

    activeState = target.dataset.state;
    window.desktopPet.triggerHoverAction(activeState);
    updateHover();
  });

  function formatTimer(ms) {
    const totalSeconds = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function updateHover() {
    app.querySelector("[data-stat='days']").textContent = `陪伴 ${stats.companionshipDays || 1} 天`;
    app.querySelector("[data-stat='interactions']").textContent = `今日 ${stats.todayInteractions || 0} 次互动`;
    const maxValue = Math.max(1, stats.maxValue || 100);
    for (const key of ["intimacy", "fullness", "health"]) {
      const value = Math.max(0, Math.min(maxValue, Math.round(Number(stats[key]) || 0)));
      const meter = app.querySelector(`[data-meter='${key}']`);
      const label = app.querySelector(`[data-value='${key}']`);
      if (meter) {
        meter.style.width = `${Math.round((value / maxValue) * 100)}%`;
      }
      if (label) {
        label.textContent = String(value);
      }
    }
    for (const button of app.querySelectorAll("[data-state]")) {
      const state = config.states.find((item) => item.id === button.dataset.state);
      const isActive = button.dataset.state === activeState;
      button.classList.toggle("is-active", isActive);
      button.disabled = Boolean(
        ((state?.id === actionIds.walk || state?.id === actionIds.squat) && isActive)
        || (state?.oneShot && isActive)
      );
    }
    const timers = stats.timers || {};
    const elapsedSinceSnapshot = Date.now() - timerSnapshotAt;
    const idleTimer = app.querySelector("[data-timer='idle']");
    const intimacyTimer = app.querySelector("[data-timer='intimacy']");
    const walkTimer = app.querySelector("[data-timer='walk']");
    if (idleTimer) {
      idleTimer.textContent = `Idle ${formatTimer((timers.nextIdleGreetingInMs || 0) - elapsedSinceSnapshot)}`;
    }
    if (intimacyTimer) {
      intimacyTimer.textContent = `Love ${formatTimer((timers.nextIntimacyDecayInMs || 0) - elapsedSinceSnapshot)}`;
    }
    if (walkTimer) {
      const walkElapsedSinceSnapshot = timers.walkLoopPaused ? 0 : elapsedSinceSnapshot;
      const remainingMs = activeState === actionIds.walk
        ? (timers.walkLoopRemainingMs || 0) - walkElapsedSinceSnapshot
        : 0;
      walkTimer.textContent = `Walk ${formatTimer(remainingMs)}`;
    }
  }

  window.desktopPet.onHoverData((nextConfig) => {
    config = nextConfig || config;
    stats = config.stats || stats;
    activeState = config.activeState || activeState;
    actionIds = config.actionIds || actionIds;
    preferredActions = Array.isArray(config.actionOrder) && config.actionOrder.length
      ? config.actionOrder
      : preferredActions;
    timerSnapshotAt = Date.now();
    renderActions();
    updateHover();
  });

  window.desktopPet.onStateChanged((state) => {
    activeState = state;
    updateHover();
  });

  window.desktopPet.onStatsChanged((nextStats) => {
    stats = nextStats || stats;
    timerSnapshotAt = Date.now();
    updateHover();
  });

  renderActions();
  updateHover();
  window.setInterval(updateHover, 1000);
}
