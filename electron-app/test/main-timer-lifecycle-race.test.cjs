const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");

function extractFunctionBody(name) {
  return mainSource.match(new RegExp(`function ${name}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] || "";
}

function extractBetween(startPattern, endPattern) {
  const start = mainSource.search(startPattern);
  assert.ok(start >= 0, `should find ${startPattern}`);
  const rest = mainSource.slice(start);
  const end = rest.search(endPattern);
  assert.ok(end > 0, `should find ${endPattern}`);
  return rest.slice(0, end);
}

test("tabby idle polling has an explicit stop path", () => {
  const stopBody = extractFunctionBody("stopTabbyIdlePolling");

  assert.ok(stopBody.length > 0, "stopTabbyIdlePolling should exist");
  assert.match(stopBody, /clearInterval\(\s*tabbyIdlePollTimer\s*\)/);
  assert.match(stopBody, /tabbyIdlePollTimer\s*=\s*null/);
});

test("before-quit stops queued tabby state timers", () => {
  const cleanupBody = extractFunctionBody("runAppBeforeQuitCleanupSequence");

  assert.ok(cleanupBody.length > 0, "runAppBeforeQuitCleanupSequence should exist");
  assert.match(cleanupBody, /appLifecycleShuttingDown\s*=\s*true/);
  assert.match(cleanupBody, /stopTabbyIdlePolling\(\)/);
  assert.match(cleanupBody, /clearTabbySleepPoseTimer\(\)/);
  assert.match(cleanupBody, /clearRagdollYawnSleepLoopTimer\(\)/);
});

test("timer callbacks only drive state while the pet window is live", () => {
  const updateIdleBody = extractFunctionBody("updateTabbyIdleActions");
  const scheduleSleepBlock = extractBetween(/function scheduleTabbySleepPose\(/, /function scheduleRagdollYawnSleepLoopTimeout\(/);
  const scheduleRagdollBlock = extractBetween(/function scheduleRagdollYawnSleepLoopTimeout\(/, /function recordUserOperation\(/);

  assert.ok(updateIdleBody.length > 0, "updateTabbyIdleActions should exist");
  assert.ok(scheduleSleepBlock.length > 0, "scheduleTabbySleepPose should exist");
  assert.ok(scheduleRagdollBlock.length > 0, "scheduleRagdollYawnSleepLoopTimeout should exist");
  assert.match(updateIdleBody, /canDrivePetStateFromTimer\(\)/);
  assert.match(scheduleSleepBlock, /canDrivePetStateFromTimer\(\)/);
  assert.match(scheduleRagdollBlock, /canDrivePetStateFromTimer\(\)/);
});

test("transition bottom anchor reads pet window bounds through the live-window helper", () => {
  const helperBody = extractFunctionBody("getPetWindowBoundsSafe");
  const transitionBody = extractFunctionBody("getTransitionBottomAnchor");

  assert.ok(helperBody.length > 0, "getPetWindowBoundsSafe should exist");
  assert.match(helperBody, /getLivePetWindow\(\)/);
  assert.match(helperBody, /win \? win\.getBounds\(\) : null/);
  assert.doesNotMatch(transitionBody, /getPetWindow\(\)\?\.getBounds\(\)/);
  assert.match(transitionBody, /getRenderedFrameBottomAnchor\(getPetWindowBoundsSafe\(\), stateId, direction\)/);
});
