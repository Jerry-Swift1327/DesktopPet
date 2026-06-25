// pet-stats-controller.cjs：pet stats 控制器，持有 stats 状态、读写、自然衰减、交互统计、状态摘要；
// 不直接接触 electron/fs/path/窗口/IPC/bubble；副作用通过 context 回调注入。
// rules 与 store 逻辑不在此重写，均通过 petStatsRules.* 与 petStatsStore.* 调用。

function createPetStatsController(context) {
  const {
    petStatsRules,
    petStatsStore,
    getNow,
    randomStatDelta,
    pickStatMessage,
    onStatsChanged,
    onStatMessages,
    getWalkLoop,
    getWalkPausedAt,
    getLastUserOperationAt,
    getLastTabbyUserOperationAt,
    getTabbySleepPoseSwitchAt,
    getWalkLoopRemainingMs,
    getLocalDateKey,
    daysBetween,
    petStatsStateConstants,
    INTIMACY_DECAY_INTERVAL_MS,
    PET_STAT_MAX,
    IDLE_GREETING_DELAY_MS,
    TABBY_YAWN_IDLE_MS,
    TABBY_SLEEP_POSE_MS,
    WALK_LOOP_DURATION_MS,
    INTERACTION_INTIMACY_GAIN_MIN,
    INTERACTION_INTIMACY_GAIN_MAX
  } = context;

  let petStats = null;
  let intimacyDecayTimer = null;
  let lastIntimacyDecayAt = context.getNow();
  let lastFullnessDecayAt = context.getNow();
  let lastHealthDecayAt = context.getNow();
  let lastHealthRecoveryAt = context.getNow();

  function normalizePetStats(stats) {
    return petStatsRules.normalizePetStats(stats, getNow());
  }

  function readPetStats() {
    const today = getLocalDateKey();
    const now = getNow();
    let stats = petStatsRules.createDefaultPetStats(now, today);
    const result = petStatsStore.readPetStatsFile();
    if (result.stats) {
      stats = { ...stats, ...result.stats };
    }
    if (!stats.firstRunDate) {
      stats.firstRunDate = today;
    }
    if (!stats.interactionDate) {
      stats.interactionDate = today;
    }
    if (!result.hasStatsActiveAt) {
      stats.lastIntimacyDecayAt = now;
      stats.lastFullnessDecayAt = now;
      stats.lastHealthDecayAt = now;
      stats.lastHealthRecoveryAt = now;
    }
    petStats = normalizePetStats(stats);
    lastIntimacyDecayAt = petStats.lastIntimacyDecayAt;
    lastFullnessDecayAt = petStats.lastFullnessDecayAt;
    lastHealthDecayAt = petStats.lastHealthDecayAt;
    lastHealthRecoveryAt = petStats.lastHealthRecoveryAt;
    resumeNaturalStatsTimers(now);
    syncDailyStats();
    writePetStats();
  }

  function writePetStats() {
    if (!petStats) {
      return;
    }
    petStats.lastStatsActiveAt = getNow();
    petStatsStore.writePetStatsFile(petStats);
  }

  function syncDailyStats() {
    if (!petStats) {
      readPetStats();
    }
    petStats = normalizePetStats(petStats);
    const today = getLocalDateKey();
    const lastInteractionDate = typeof petStats.interactionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(petStats.interactionDate)
      ? petStats.interactionDate
      : today;
    if (lastInteractionDate === today) {
      petStats.interactionDate = today;
      return false;
    }

    const overdueDays = Math.max(1, daysBetween(lastInteractionDate, today));
    petStatsRules.applyDailyDecay(petStats, overdueDays);
    petStats.interactionDate = today;
    petStats.todayInteractions = 0;
    writePetStats();
    return true;
  }

  function buildTimerSummary(now = getNow()) {
    const walkLoop = getWalkLoop();
    const walkPausedAt = getWalkPausedAt();
    const walkLoopRemainingMs = getWalkLoopRemainingMs(walkLoop, now, walkPausedAt);
    return {
      idleGreetingDelayMs: IDLE_GREETING_DELAY_MS,
      intimacyDecayDelayMs: INTIMACY_DECAY_INTERVAL_MS,
      walkLoopDurationMs: WALK_LOOP_DURATION_MS,
      lastOperationElapsedMs: Math.max(0, now - getLastUserOperationAt()),
      lastInteractionElapsedMs: Math.max(0, now - (petStats?.lastInteractionAt || now)),
      nextIdleGreetingInMs: Math.max(0, IDLE_GREETING_DELAY_MS - (now - getLastUserOperationAt())),
      nextTabbyYawnInMs: Math.max(0, TABBY_YAWN_IDLE_MS - (now - getLastTabbyUserOperationAt())),
      nextTabbySleepPoseInMs: Math.max(0, getTabbySleepPoseSwitchAt() - now),
      nextIntimacyDecayInMs: Math.max(0, INTIMACY_DECAY_INTERVAL_MS - (now - lastIntimacyDecayAt)),
      walkLoopRemainingMs,
      walkLoopPaused: Boolean(walkLoop?.endsAt && walkPausedAt)
    };
  }

  function buildStatsSummary() {
    if (!petStats) {
      readPetStats();
    }
    petStats = normalizePetStats(petStats);
    syncDailyStats();
    const today = getLocalDateKey();

    return {
      companionshipDays: daysBetween(petStats.firstRunDate, today),
      todayInteractions: petStats.todayInteractions,
      intimacy: petStats.intimacy,
      fullness: petStats.fullness,
      health: petStats.health,
      maxValue: PET_STAT_MAX,
      timers: buildTimerSummary()
    };
  }

  function resumeNaturalStatsTimers(now = getNow()) {
    if (!petStats) {
      return;
    }
    const offlineElapsedMs = Math.max(0, now - petStats.lastStatsActiveAt);
    if (offlineElapsedMs <= 0) {
      petStats.lastStatsActiveAt = now;
      return;
    }

    lastIntimacyDecayAt = Math.min(now, lastIntimacyDecayAt + offlineElapsedMs);
    lastFullnessDecayAt = Math.min(now, lastFullnessDecayAt + offlineElapsedMs);
    lastHealthDecayAt = Math.min(now, lastHealthDecayAt + offlineElapsedMs);
    lastHealthRecoveryAt = Math.min(now, lastHealthRecoveryAt + offlineElapsedMs);
    petStats.lastIntimacyDecayAt = lastIntimacyDecayAt;
    petStats.lastFullnessDecayAt = lastFullnessDecayAt;
    petStats.lastHealthDecayAt = lastHealthDecayAt;
    petStats.lastHealthRecoveryAt = lastHealthRecoveryAt;
    petStats.lastStatsActiveAt = now;
  }

  function applyNaturalStatsTick(now = getNow()) {
    if (!petStats) {
      readPetStats();
    }
    petStats = normalizePetStats(petStats);
    syncDailyStats();
    const decayRefs = {
      lastIntimacyDecayAt,
      lastFullnessDecayAt,
      lastHealthDecayAt,
      lastHealthRecoveryAt
    };
    const result = petStatsRules.applyNaturalStatsTickRules(petStats, now, decayRefs);
    if (result.updates.lastIntimacyDecayAt !== undefined) {
      lastIntimacyDecayAt = result.updates.lastIntimacyDecayAt;
    }
    if (result.updates.lastFullnessDecayAt !== undefined) {
      lastFullnessDecayAt = result.updates.lastFullnessDecayAt;
    }
    if (result.updates.lastHealthDecayAt !== undefined) {
      lastHealthDecayAt = result.updates.lastHealthDecayAt;
    }
    if (result.updates.lastHealthRecoveryAt !== undefined) {
      lastHealthRecoveryAt = result.updates.lastHealthRecoveryAt;
    }
    petStats.lastIntimacyDecayAt = lastIntimacyDecayAt;
    petStats.lastFullnessDecayAt = lastFullnessDecayAt;
    petStats.lastHealthDecayAt = lastHealthDecayAt;
    petStats.lastHealthRecoveryAt = lastHealthRecoveryAt;
    const messages = result.prompts.map(key => pickStatMessage(key)).filter(Boolean);
    if (result.changed) {
      writePetStats();
    }
    onStatsChanged();
    onStatMessages(messages);
    return result.changed;
  }

  function startIntimacyDecayTimer() {
    if (intimacyDecayTimer) {
      return;
    }
    intimacyDecayTimer = setInterval(() => {
      applyNaturalStatsTick();
    }, 60 * 1000);
  }

  function stopIntimacyDecayTimer() {
    if (!intimacyDecayTimer) {
      return;
    }
    clearInterval(intimacyDecayTimer);
    intimacyDecayTimer = null;
  }

  function recordInteraction() {
    if (!petStats) {
      readPetStats();
    }
    petStats = normalizePetStats(petStats);
    syncDailyStats();
    petStatsRules.recordInteractionRules(petStats, getNow());
    writePetStats();
    onStatsChanged();
  }

  function updateStatPromptState(messages = []) {
    const keys = petStatsRules.applyPromptStateRules(petStats);
    for (const key of keys) {
      const text = pickStatMessage(key);
      if (text) {
        messages.push(text);
      }
    }
    return messages;
  }

  function applyActionStats(stateId) {
    if (!petStats) {
      readPetStats();
    }
    petStats = normalizePetStats(petStats);
    syncDailyStats();
    const intimacyGainDelta = stateId !== petStatsStateConstants.squat
      ? randomStatDelta(INTERACTION_INTIMACY_GAIN_MIN, INTERACTION_INTIMACY_GAIN_MAX)
      : 0;
    const result = petStatsRules.applyActionStatsRules(petStats, stateId, {
      intimacyGainDelta,
      stateConstants: petStatsStateConstants
    });
    const messages = result.prompts.map(key => pickStatMessage(key)).filter(Boolean);
    writePetStats();
    onStatsChanged();
    return messages;
  }

  function applyInterruptedWalkStats() {
    if (!petStats) {
      readPetStats();
    }
    petStats = normalizePetStats(petStats);
    syncDailyStats();
    const keys = petStatsRules.applyPromptStateRules(petStats);
    // 原 applyInterruptedWalkStats 调用 updateStatPromptState() 但不弹气泡：仅更新 prompt 标记
    void keys;
    writePetStats();
    onStatsChanged();
  }

  function applyCompletedWalkStats() {
    if (!petStats) {
      readPetStats();
    }
    petStats = normalizePetStats(petStats);
    syncDailyStats();
    const intimacyGainDelta = randomStatDelta(INTERACTION_INTIMACY_GAIN_MIN, INTERACTION_INTIMACY_GAIN_MAX);
    const result = petStatsRules.applyCompletedWalkStatsRules(petStats, { intimacyGainDelta });
    const messages = result.prompts.map(key => pickStatMessage(key)).filter(Boolean);
    writePetStats();
    onStatsChanged();
    return messages;
  }

  return {
    normalizePetStats,
    readPetStats,
    writePetStats,
    syncDailyStats,
    buildTimerSummary,
    buildStatsSummary,
    resumeNaturalStatsTimers,
    applyNaturalStatsTick,
    startIntimacyDecayTimer,
    stopIntimacyDecayTimer,
    recordInteraction,
    updateStatPromptState,
    applyActionStats,
    applyInterruptedWalkStats,
    applyCompletedWalkStats
  };
}

module.exports = { createPetStatsController };
