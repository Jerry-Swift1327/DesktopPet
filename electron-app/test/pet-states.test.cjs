const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  sharedGreetings,
  buildPetState,
  buildPetStates
} = require("../electron/pet/pet-states.cjs");

// sharedGreetings：共享问候语集合
test("sharedGreetings 是非空字符串数组", () => {
  assert.ok(Array.isArray(sharedGreetings));
  assert.ok(sharedGreetings.length > 0);
  for (const greeting of sharedGreetings) {
    assert.equal(typeof greeting, "string");
    assert.ok(greeting.length > 0);
  }
});

// buildPetState：单个宠物状态工厂
test("buildPetState 生成结构正确的状态对象", () => {
  const state = buildPetState({
    id: "petSquat",
    label: "蹲坐",
    action: "squat",
    assetsRoot: "assets/animations",
    animationPrefix: "dog"
  });

  assert.equal(state.id, "petSquat");
  assert.equal(state.label, "蹲坐");
  assert.equal(state.folder, path.join("assets/animations", "dog_squat", "transparent_frames"));
  assert.equal(state.metadata, path.join("assets/animations", "dog_squat", "loop.json"));
  assert.equal(state.frameMs, 30);
  assert.equal(state.loopStart, 0);
  assert.equal(state.loopEnd, 0);
  assert.equal(state.defaultFacing, "left");
  assert.equal(state.moving, false);
  assert.equal(state.greetings, sharedGreetings);
  // 默认不携带 frameSequence 字段
  assert.equal(state.frameSequence, undefined);
});

test("buildPetState 支持自定义参数和 frameSequence", () => {
  const customGreetings = ["你好", "我很好"];
  const state = buildPetState({
    id: "petFeed",
    label: "喂食",
    action: "feed",
    assetsRoot: "assets/animations",
    animationPrefix: "cat",
    frameMs: 50,
    loopStart: 1,
    loopEnd: 10,
    defaultFacing: "right",
    moving: true,
    frameSequence: { repeatRangeStart: 0, repeatRangeEnd: 999, repeatCount: 2 },
    greetings: customGreetings
  });

  assert.equal(state.frameMs, 50);
  assert.equal(state.loopStart, 1);
  assert.equal(state.loopEnd, 10);
  assert.equal(state.defaultFacing, "right");
  assert.equal(state.moving, true);
  assert.equal(state.greetings, customGreetings);
  assert.deepEqual(state.frameSequence, { repeatRangeStart: 0, repeatRangeEnd: 999, repeatCount: 2 });
  assert.equal(state.folder, path.join("assets/animations", "cat_feed", "transparent_frames"));
});

// buildPetStates：根据 actionIds 构建完整 states 数组
const ACTION_IDS = {
  squat: "petSquat",
  walk: "petWalk",
  feed: "petFeed",
  ball: "petBall",
  lie: "petLie",
  spin: "petSpin",
  lick: "petLick",
  belly: "petBelly",
  stretch: "petStretch",
  shake: "petShake",
  yawn: "petYawn",
  sleep: "petSleep",
  hiss: "petHiss"
};

const EXPECTED_ORDER = ["squat", "walk", "feed", "ball", "lie", "spin", "lick", "belly", "stretch", "shake", "yawn", "sleep", "hiss"];
const EXPECTED_LABELS = ["蹲坐", "闲逛", "喂食", "玩耍", "趴下", "转圈", "舔爪", "翻肚", "伸展", "抖身", "打哈欠", "睡觉", "哈气"];

test("buildPetStates 生成 13 个状态", () => {
  const states = buildPetStates(ACTION_IDS, "assets/animations", "dog");

  assert.equal(states.length, 13);
});

test("buildPetStates 状态顺序与定义一致", () => {
  const states = buildPetStates(ACTION_IDS, "assets/animations", "dog");

  assert.deepEqual(
    states.map(state => state.id),
    EXPECTED_ORDER.map(action => ACTION_IDS[action])
  );
  assert.deepEqual(
    states.map(state => state.label),
    EXPECTED_LABELS
  );
});

test("buildPetStates 仅 walk 的 moving 为 true", () => {
  const states = buildPetStates(ACTION_IDS, "assets/animations", "dog");

  for (const state of states) {
    if (state.id === "petWalk") {
      assert.equal(state.moving, true);
    } else {
      assert.equal(state.moving, false);
    }
  }
});

test("buildPetStates 仅 feed 携带 frameSequence 字段", () => {
  const states = buildPetStates(ACTION_IDS, "assets/animations", "dog");

  for (const state of states) {
    if (state.id === "petFeed") {
      assert.ok(state.frameSequence, "feed 应包含 frameSequence");
      assert.deepEqual(state.frameSequence, { repeatRangeStart: 0, repeatRangeEnd: 999, repeatCount: 2 });
    } else {
      assert.equal(state.frameSequence, undefined, `${state.id} 不应包含 frameSequence`);
    }
  }
});

test("buildPetStates 正确拼接 folder 和 metadata 路径", () => {
  const states = buildPetStates(ACTION_IDS, "assets/animations", "dog");

  states.forEach((state, index) => {
    const action = EXPECTED_ORDER[index];
    assert.equal(
      state.folder,
      path.join("assets/animations", `dog_${action}`, "transparent_frames")
    );
    assert.equal(
      state.metadata,
      path.join("assets/animations", `dog_${action}`, "loop.json")
    );
  });
});

test("buildPetStates 所有状态的 greetings 引用 sharedGreetings", () => {
  const states = buildPetStates(ACTION_IDS, "assets/animations", "dog");

  for (const state of states) {
    assert.equal(state.greetings, sharedGreetings);
  }
});

test("buildPetStates 支持传入自定义 greetings", () => {
  const customGreetings = ["自定义问候"];
  const states = buildPetStates(ACTION_IDS, "assets/animations", "dog", customGreetings);

  for (const state of states) {
    assert.equal(state.greetings, customGreetings);
  }
});
