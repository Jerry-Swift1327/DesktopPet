// pet-stats-rules.cjs：pet stats 纯规则模块，不依赖 electron/fs/Date.now/Math.random/中文文案。
// STATE_* 常量不在本模块定义，由调用方通过 options.stateConstants 传入，本模块只做相等比较。

const {
  PET_STAT_MIN,
  PET_STAT_MAX,
  PET_INTIMACY_DEFAULT,
  PET_FULLNESS_DEFAULT,
  PET_HEALTH_DEFAULT,
  INTIMACY_DECAY_INTERVAL_MS,
  FULLNESS_DECAY_INTERVAL_MS,
  HEALTH_DECAY_INTERVAL_MS,
  HEALTH_RECOVERY_INTERVAL_MS,
  STAT_NATURAL_DELTA,
  LIE_HEALTH_GAIN,
  LICK_HEALTH_GAIN,
  BELLY_FULLNESS_COST,
  STRETCH_HEALTH_GAIN,
  STRETCH_FULLNESS_COST,
  HEALTH_RECOVERY_THRESHOLD,
  HUNGER_WARNING_THRESHOLD,
  HUNGER_CRITICAL_THRESHOLD,
  EXHAUSTED_THRESHOLD,
  HEALTH_TIRED_THRESHOLD,
  HEALTH_RECOVERED_THRESHOLD,
  FULL_PROMPT_THRESHOLD,
  CLOSE_PROMPT_THRESHOLD,
  CLOSE_PROMPT_RESET_THRESHOLD,
  HUNGER_PROMPT_CLEAR_THRESHOLD,
  FULL_PROMPT_RESET_THRESHOLD,
  HEALTH_PROMPT_CLEAR_THRESHOLD,
  DAILY_DECAY_FULLNESS,
  DAILY_DECAY_HEALTH
} = require("../core/app-constants.cjs");
const { clamp } = require("../shared/bounds.cjs");

function clampStat(value) {
  return Math.round(clamp(Number(value) || 0, PET_STAT_MIN, PET_STAT_MAX));
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysBetween(startDateKey, endDateKey) {
  const [startYear, startMonth, startDay] = startDateKey.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDateKey.split("-").map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.max(1, Math.floor((end - start) / 86400000) + 1);
}

function createDefaultPetStats(now, today) {
  return {
    firstRunDate: today,
    interactionDate: today,
    todayInteractions: 0,
    intimacy: PET_INTIMACY_DEFAULT,
    fullness: PET_FULLNESS_DEFAULT,
    health: PET_HEALTH_DEFAULT,
    hungerPromptLevel: 0,
    healthPromptLevel: 0,
    fullPrompted: false,
    closePrompted: false,
    lastInteractionAt: now,
    lastIntimacyDecayAt: now,
    lastFullnessDecayAt: now,
    lastHealthDecayAt: now,
    lastHealthRecoveryAt: now,
    lastStatsActiveAt: now
  };
}

function normalizePetStats(stats, now) {
  return {
    ...stats,
    intimacy: clampStat(Number.isFinite(stats.intimacy) ? stats.intimacy : PET_INTIMACY_DEFAULT),
    fullness: clampStat(Number.isFinite(stats.fullness) ? stats.fullness : PET_FULLNESS_DEFAULT),
    health: clampStat(Number.isFinite(stats.health) ? stats.health : PET_HEALTH_DEFAULT),
    hungerPromptLevel: Number.isInteger(stats.hungerPromptLevel) ? stats.hungerPromptLevel : 0,
    healthPromptLevel: Number.isInteger(stats.healthPromptLevel) ? stats.healthPromptLevel : 0,
    fullPrompted: Boolean(stats.fullPrompted),
    closePrompted: Boolean(stats.closePrompted),
    lastInteractionAt: Number.isFinite(stats.lastInteractionAt) ? stats.lastInteractionAt : now,
    lastIntimacyDecayAt: Number.isFinite(stats.lastIntimacyDecayAt) ? stats.lastIntimacyDecayAt : now,
    lastFullnessDecayAt: Number.isFinite(stats.lastFullnessDecayAt) ? stats.lastFullnessDecayAt : now,
    lastHealthDecayAt: Number.isFinite(stats.lastHealthDecayAt) ? stats.lastHealthDecayAt : now,
    lastHealthRecoveryAt: Number.isFinite(stats.lastHealthRecoveryAt) ? stats.lastHealthRecoveryAt : now,
    lastStatsActiveAt: Number.isFinite(stats.lastStatsActiveAt) ? stats.lastStatsActiveAt : now
  };
}

function applyDailyDecay(stats, days = 1) {
  const decayDays = Math.max(0, Math.floor(Number(days) || 0));
  if (!stats || decayDays <= 0) {
    return false;
  }

  let changed = false;
  const before = {
    intimacy: stats.intimacy,
    fullness: stats.fullness,
    health: stats.health
  };

  if (decayDays > 0) {
    stats.fullness = clampStat(stats.fullness - DAILY_DECAY_FULLNESS * decayDays);
    stats.health = clampStat(stats.health - DAILY_DECAY_HEALTH * decayDays);
  }

  if (stats.fullness > HUNGER_PROMPT_CLEAR_THRESHOLD) {
    stats.hungerPromptLevel = 0;
  }
  if (stats.fullness < FULL_PROMPT_RESET_THRESHOLD) {
    stats.fullPrompted = false;
  }
  if (stats.health > HEALTH_PROMPT_CLEAR_THRESHOLD) {
    stats.healthPromptLevel = 0;
  }
  if (stats.intimacy < CLOSE_PROMPT_RESET_THRESHOLD) {
    stats.closePrompted = false;
  }
  if (stats.fullness <= HUNGER_CRITICAL_THRESHOLD) {
    stats.hungerPromptLevel = Math.max(stats.hungerPromptLevel, 2);
  } else if (stats.fullness <= HUNGER_WARNING_THRESHOLD) {
    stats.hungerPromptLevel = Math.max(stats.hungerPromptLevel, 1);
  }
  if (stats.health <= HEALTH_TIRED_THRESHOLD) {
    stats.healthPromptLevel = Math.max(stats.healthPromptLevel, 1);
  }

  changed = before.intimacy !== stats.intimacy
    || before.fullness !== stats.fullness
    || before.health !== stats.health;
  return changed;
}

function applyPromptStateRules(stats) {
  const prompts = [];
  if (stats.fullness > HUNGER_PROMPT_CLEAR_THRESHOLD) {
    stats.hungerPromptLevel = 0;
  } else if (stats.fullness > EXHAUSTED_THRESHOLD && stats.hungerPromptLevel >= 3) {
    stats.hungerPromptLevel = stats.fullness <= HUNGER_CRITICAL_THRESHOLD
      ? 2
      : stats.fullness <= HUNGER_WARNING_THRESHOLD ? 1 : 0;
  }
  if (stats.fullness < FULL_PROMPT_RESET_THRESHOLD) {
    stats.fullPrompted = false;
  }
  if (stats.health > HEALTH_PROMPT_CLEAR_THRESHOLD) {
    stats.healthPromptLevel = 0;
  }
  if (stats.intimacy < CLOSE_PROMPT_RESET_THRESHOLD) {
    stats.closePrompted = false;
  }
  if (stats.fullness <= EXHAUSTED_THRESHOLD && stats.hungerPromptLevel < 3) {
    stats.hungerPromptLevel = 3;
    prompts.push("exhausted");
  } else if (stats.fullness <= HUNGER_CRITICAL_THRESHOLD && stats.hungerPromptLevel < 2) {
    stats.hungerPromptLevel = 2;
    prompts.push("hungry");
  } else if (stats.fullness <= HUNGER_WARNING_THRESHOLD && stats.hungerPromptLevel < 1) {
    stats.hungerPromptLevel = 1;
    prompts.push("needFood");
  }
  if (stats.health <= HEALTH_TIRED_THRESHOLD && stats.healthPromptLevel < 1) {
    stats.healthPromptLevel = 1;
    prompts.push("tired");
  }
  if (stats.health >= HEALTH_RECOVERED_THRESHOLD && stats.healthPromptLevel > 0) {
    stats.healthPromptLevel = 0;
    prompts.push("recovered");
  }
  if (stats.intimacy >= CLOSE_PROMPT_THRESHOLD && !stats.closePrompted) {
    stats.closePrompted = true;
    prompts.push("close");
  }
  return prompts;
}

function applyNaturalStatsTickRules(stats, now, decayRefs) {
  let statsChanged = false;
  const updates = {};

  const decayIntimacySteps = Math.floor((now - decayRefs.lastIntimacyDecayAt) / INTIMACY_DECAY_INTERVAL_MS);
  if (decayIntimacySteps > 0) {
    stats.intimacy = clampStat(stats.intimacy - decayIntimacySteps * STAT_NATURAL_DELTA);
    updates.lastIntimacyDecayAt = decayRefs.lastIntimacyDecayAt + decayIntimacySteps * INTIMACY_DECAY_INTERVAL_MS;
    statsChanged = true;
  }
  const decayFullnessSteps = Math.floor((now - decayRefs.lastFullnessDecayAt) / FULLNESS_DECAY_INTERVAL_MS);
  if (decayFullnessSteps > 0) {
    stats.fullness = clampStat(stats.fullness - decayFullnessSteps * STAT_NATURAL_DELTA);
    updates.lastFullnessDecayAt = decayRefs.lastFullnessDecayAt + decayFullnessSteps * FULLNESS_DECAY_INTERVAL_MS;
    statsChanged = true;
  }
  const decayHealthSteps = Math.floor((now - decayRefs.lastHealthDecayAt) / HEALTH_DECAY_INTERVAL_MS);
  if (decayHealthSteps > 0) {
    stats.health = clampStat(stats.health - decayHealthSteps * STAT_NATURAL_DELTA);
    updates.lastHealthDecayAt = decayRefs.lastHealthDecayAt + decayHealthSteps * HEALTH_DECAY_INTERVAL_MS;
    statsChanged = true;
  }
  const recoverySteps = Math.floor((now - decayRefs.lastHealthRecoveryAt) / HEALTH_RECOVERY_INTERVAL_MS);
  if (recoverySteps > 0) {
    const recovery = (stats.intimacy >= HEALTH_RECOVERY_THRESHOLD ? recoverySteps : 0)
      + (stats.fullness >= HEALTH_RECOVERY_THRESHOLD ? recoverySteps : 0);
    if (recovery > 0) {
      stats.health = clampStat(stats.health + recovery);
      statsChanged = true;
    }
    updates.lastHealthRecoveryAt = decayRefs.lastHealthRecoveryAt + recoverySteps * HEALTH_RECOVERY_INTERVAL_MS;
    statsChanged = true;
  }

  stats.lastIntimacyDecayAt = updates.lastIntimacyDecayAt !== undefined
    ? updates.lastIntimacyDecayAt
    : decayRefs.lastIntimacyDecayAt;
  stats.lastFullnessDecayAt = updates.lastFullnessDecayAt !== undefined
    ? updates.lastFullnessDecayAt
    : decayRefs.lastFullnessDecayAt;
  stats.lastHealthDecayAt = updates.lastHealthDecayAt !== undefined
    ? updates.lastHealthDecayAt
    : decayRefs.lastHealthDecayAt;
  stats.lastHealthRecoveryAt = updates.lastHealthRecoveryAt !== undefined
    ? updates.lastHealthRecoveryAt
    : decayRefs.lastHealthRecoveryAt;

  const prompts = applyPromptStateRules(stats);
  const changed = statsChanged || prompts.length > 0;
  return { changed, updates, prompts };
}

// options = { intimacyGainDelta, stateConstants }
// stateConstants = { squat, feed, lie, lick, belly, stretch }
// STATE_* 常量来自运行时 petActionIds，不在本模块定义，由调用方传入以便做相等比较。
function applyActionStatsRules(stats, stateId, options) {
  const opts = options || {};
  const stateConstants = opts.stateConstants || {};
  if (stateId !== stateConstants.squat) {
    stats.intimacy = clampStat(stats.intimacy + opts.intimacyGainDelta);
  }
  if (stateId === stateConstants.feed) {
    stats.fullness = PET_STAT_MAX;
  }
  if (stateId === stateConstants.lie) {
    stats.health = clampStat(stats.health + LIE_HEALTH_GAIN);
  }
  if (stateId === stateConstants.lick) {
    stats.health = clampStat(stats.health + LICK_HEALTH_GAIN);
  }
  if (stateId === stateConstants.belly) {
    stats.fullness = clampStat(stats.fullness - BELLY_FULLNESS_COST);
  }
  if (stateId === stateConstants.stretch) {
    stats.health = clampStat(stats.health + STRETCH_HEALTH_GAIN);
    stats.fullness = clampStat(stats.fullness - STRETCH_FULLNESS_COST);
  }

  const prompts = [];
  if (stateId === stateConstants.feed && stats.fullness >= FULL_PROMPT_THRESHOLD && !stats.fullPrompted) {
    stats.fullPrompted = true;
    prompts.push("full");
  }
  const otherPrompts = applyPromptStateRules(stats);
  return { prompts: prompts.concat(otherPrompts) };
}

// options = { intimacyGainDelta }
function applyCompletedWalkStatsRules(stats, options) {
  const opts = options || {};
  stats.intimacy = clampStat(stats.intimacy + opts.intimacyGainDelta);
  const prompts = applyPromptStateRules(stats);
  return { prompts };
}

function recordInteractionRules(stats, now) {
  stats.lastInteractionAt = now;
  stats.todayInteractions += 1;
}

module.exports = {
  clampStat,
  getLocalDateKey,
  daysBetween,
  createDefaultPetStats,
  normalizePetStats,
  applyDailyDecay,
  applyPromptStateRules,
  applyNaturalStatsTickRules,
  applyActionStatsRules,
  applyCompletedWalkStatsRules,
  recordInteractionRules
};
