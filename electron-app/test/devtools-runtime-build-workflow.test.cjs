const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRuntimeBuildWorkflow } = require("../devtools/services/runtime-build-workflow.cjs");

function createChild(pid = 4200) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => {};
  return child;
}

function createHarness(options = {}) {
  const appRoot = options.appRoot || fs.mkdtempSync(path.join(os.tmpdir(), "desktop-pet-devtools-process-"));
  const children = [];
  const spawnCalls = [];
  const terminated = [];
  const workflow = createRuntimeBuildWorkflow({
    appRoot,
    platform: "win32",
    environment: { ComSpec: "C:\\Windows\\System32\\cmd.exe", KEEP_ME: "yes" },
    listVariants: () => [{
      id: "pet2615",
      scope: "custom",
      platforms: ["win32"],
      deliveryPathSegments: ["custom", "pet2615"]
    }],
    spawn: (command, args, spawnOptions) => {
      spawnCalls.push({ command, args, options: spawnOptions });
      const child = createChild(4200 + children.length);
      children.push(child);
      return child;
    },
    terminateProcessTree: (child) => terminated.push(child.pid)
  });
  return { appRoot, workflow, children, spawnCalls, terminated };
}

test("devtools local runner uses npm start with structured variant environment and can stop", async () => {
  const harness = createHarness();
  const statuses = [];
  const logs = [];
  const start = harness.workflow.startRuntime({ variant: "pet2615", channel: "installer" }, {
    onStatus: (event) => statuses.push(event),
    onLog: (event) => logs.push(event)
  });
  const child = harness.children[0];
  child.emit("spawn");
  const result = await start;

  assert.equal(result.status, "running");
  assert.equal(harness.spawnCalls[0].command, "C:\\Windows\\System32\\cmd.exe");
  assert.deepEqual(harness.spawnCalls[0].args, ["/d", "/s", "/c", "npm.cmd start"]);
  assert.equal(harness.spawnCalls[0].options.cwd, harness.appRoot);
  assert.equal(harness.spawnCalls[0].options.env.PET_VARIANT, "pet2615");
  assert.equal(harness.spawnCalls[0].options.env.PET_CHANNEL, "installer");
  assert.equal(harness.spawnCalls[0].options.env.KEEP_ME, "yes");
  assert.equal(logs[0].message, "$ npm.cmd start");

  await harness.workflow.stopRuntime({ onStatus: (event) => statuses.push(event) });
  assert.deepEqual(harness.terminated, [child.pid]);
  assert.equal(statuses.some((event) => event.status === "stopping"), true);
  child.emit("exit", 0);
  assert.equal(harness.workflow.getStatus().runtime.status, "exited");
});

test("devtools Windows build maps installer channel and exposes only the successful output directory", async () => {
  const harness = createHarness();
  const statuses = [];
  const logs = [];
  const build = harness.workflow.runWindowsBuild({ variant: "pet2615", channel: "installer" }, {
    onStatus: (event) => statuses.push(event),
    onLog: (event) => logs.push(event)
  });
  const child = harness.children[0];
  child.stdout.emit("data", Buffer.from("building installer"));
  const expectedOutput = path.join(harness.appRoot, "deliverables", "custom", "pet2615", "installer");
  fs.mkdirSync(expectedOutput, { recursive: true });
  child.emit("exit", 0);
  const result = await build;

  assert.equal(harness.spawnCalls[0].command, "powershell.exe");
  assert.deepEqual(harness.spawnCalls[0].args.slice(0, 4), ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"]);
  assert.match(harness.spawnCalls[0].args[4], /build-installer-win\.ps1$/);
  assert.deepEqual(harness.spawnCalls[0].args.slice(-2), ["-PetVariant", "pet2615"]);
  assert.equal(result.outputDir, expectedOutput);
  assert.equal(harness.workflow.getLastSuccessfulBuildOutput(), expectedOutput);
  assert.equal(statuses.at(-1).canOpenBuildOutput, true);
  assert.equal(logs.some((event) => event.message === "building installer"), true);
});

test("devtools Windows build rejects unknown targets and does not expose failed outputs", async () => {
  const harness = createHarness();
  assert.throws(
    () => harness.workflow.buildWindowsPlan({ variant: "pet9999", channel: "release" }),
    /未知宠物变体/
  );
  assert.throws(
    () => harness.workflow.buildWindowsPlan({ variant: "pet2615", channel: "preview" }),
    /未知宠物渠道/
  );

  const build = harness.workflow.runWindowsBuild({ variant: "pet2615", channel: "release" });
  harness.children[0].emit("exit", 7);
  await assert.rejects(build, /退出码：7/);
  assert.throws(() => harness.workflow.getLastSuccessfulBuildOutput(), /没有可打开/);
});
