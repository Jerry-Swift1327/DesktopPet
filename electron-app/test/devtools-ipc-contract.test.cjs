const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const mainSource = fs.readFileSync(path.join(ROOT, "devtools", "main.cjs"), "utf8");
const preloadSource = fs.readFileSync(path.join(ROOT, "devtools", "preload.cjs"), "utf8");

const invokeContracts = [
  ["listVariants", "devtools:listVariants"],
  ["getVariantDetails", "devtools:getVariantDetails"],
  ["checkVariant", "devtools:checkVariant"],
  ["generateGallery", "devtools:generateGallery"],
  ["openGallery", "devtools:openGallery"],
  ["buildReplaceActionPreview", "devtools:buildReplaceActionPreview"],
  ["runReplaceAction", "devtools:runReplaceAction"],
  ["buildReplaceActionsPreview", "devtools:buildReplaceActionsPreview"],
  ["runReplaceActions", "devtools:runReplaceActions"],
  ["buildRenameAssetsPreview", "devtools:buildRenameAssetsPreview"],
  ["runRenameAssets", "devtools:runRenameAssets"],
  ["buildMetadataEditPreview", "devtools:buildMetadataEditPreview"],
  ["applyMetadataEdit", "devtools:applyMetadataEdit"],
  ["getActionFramePool", "devtools:getActionFramePool"],
  ["buildGenerateFramePoolPreview", "devtools:buildGenerateFramePoolPreview"],
  ["generateFramePool", "devtools:generateFramePool"],
  ["buildReselectRuntimeFramesPreview", "devtools:buildReselectRuntimeFramesPreview"],
  ["reselectRuntimeFrames", "devtools:reselectRuntimeFrames"],
  ["buildDeleteActionPreview", "devtools:buildDeleteActionPreview"],
  ["deleteAction", "devtools:deleteAction"],
  ["buildDeleteVariantPreview", "devtools:buildDeleteVariantPreview"],
  ["deleteTestVariant", "devtools:deleteTestVariant"]
];

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("devtools preload exposes maintenance IPC methods", () => {
  for (const [method, channel] of invokeContracts) {
    assert.match(preloadSource, new RegExp(`${method}:`), `preload should expose ${method}`);
    assert.match(
      preloadSource,
      new RegExp(`ipcRenderer\\.invoke\\(\\s*["']${escapeRegex(channel)}["']`),
      `preload should invoke ${channel}`
    );
  }
});

test("devtools main registers maintenance IPC handlers and task stages", () => {
  for (const [, channel] of invokeContracts) {
    assert.match(
      mainSource,
      new RegExp(`ipcMain\\.handle\\(\\s*["']${escapeRegex(channel)}["']`),
      `main should register ${channel}`
    );
  }
});
