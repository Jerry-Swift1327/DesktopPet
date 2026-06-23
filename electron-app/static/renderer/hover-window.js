// 悬停面板渲染：属性、计时器、动作按钮

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
        <span data-timer="idle">Idle
01:00</span>
        <span data-timer="intimacy">Love
30:00</span>
        <span data-timer="walk">Walk
00:00</span>
        ${config.channelConfig?.showYawnTimer ? `<span data-timer="yawn">Yawn
02:00</span>` : ""}
        ${config.channelConfig?.showSleepPoseTimer ? `<span data-timer="sleep-pose">Pose
00:00</span>` : ""}
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
        || (state?.id === actionIds.lie && isActive)
        || (state?.oneShot && isActive)
      );
    }
    const timers = stats.timers || {};
    const elapsedSinceSnapshot = Date.now() - timerSnapshotAt;
    const idleTimer = app.querySelector("[data-timer='idle']");
    const intimacyTimer = app.querySelector("[data-timer='intimacy']");
    const walkTimer = app.querySelector("[data-timer='walk']");
    const yawnTimer = app.querySelector("[data-timer='yawn']");
    const sleepPoseTimer = app.querySelector("[data-timer='sleep-pose']");
    if (idleTimer) {
      idleTimer.textContent = `Idle\n${formatTimer((timers.nextIdleGreetingInMs || 0) - elapsedSinceSnapshot)}`;
    }
    if (intimacyTimer) {
      intimacyTimer.textContent = `Love\n${formatTimer((timers.nextIntimacyDecayInMs || 0) - elapsedSinceSnapshot)}`;
    }
    if (walkTimer) {
      const walkElapsedSinceSnapshot = timers.walkLoopPaused ? 0 : elapsedSinceSnapshot;
      const remainingMs = activeState === actionIds.walk
        ? (timers.walkLoopRemainingMs || 0) - walkElapsedSinceSnapshot
        : 0;
      walkTimer.textContent = `Walk\n${formatTimer(remainingMs)}`;
    }
    if (yawnTimer) {
      yawnTimer.textContent = `Yawn\n${formatTimer((timers.nextTabbyYawnInMs || 0) - elapsedSinceSnapshot)}`;
    }
    if (sleepPoseTimer) {
      sleepPoseTimer.textContent = `Pose\n${formatTimer((timers.nextTabbySleepPoseInMs || 0) - elapsedSinceSnapshot)}`;
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
