// 宠物状态定义，含状态工厂和资源路径计算

const path = require("path");
const { ACTION_POOL } = require("../pet-catalog.cjs");

// 共享问候语，所有状态默认使用
const sharedGreetings = [
  "主人，你想我没？我很想你",
  "现在你在想谁呢？",
  "累坏我宝了，偷个懒歇会吧！",
  "我想你了，你想我了吗？",
  "世界万般好，不及你一半!",
  "目光所及，四下皆是你！",
  "万事不用愁，咱家为你加油！",
  "你不用多好，有你就是最好！",
  "主人啥时候带我吃香喝辣的？",
  "再忙也陪陪我嘛！",
  "肚子咕咕叫，快喂我好吃的嘛",
  "空空的肚子，急需美食投喂",
  "再不吃东西，我就要啃屏幕咯",
  "你好久都没理我了……",
  "孤零零的，有点难过呢",
  "哼，我才不要主动搭话",
  "我就在这儿，陪着你哦",
  "忙完啦？来聊两句吧",
  "最喜欢主人啦，贴贴～",
  "一刻都不想离开你身边",
  "抓到你啦，不许偷偷忽略我",
  "身体棒棒，陪你一整天",
  "状态在线，随时陪玩哦",
  "精力爆棚，想到处溜达！",
  "浑身充满力气，太开心啦",
  "摸鱼时间到，快乐加倍！",
  "键盘敲累啦，抬头看看我呗",
  "不管多忙，我一直陪着你",
  "累了就歇歇，我在身边哦",
  "平凡时光，有我就很美好",
  "偷偷溜一圈，吓唬一下主人",
  "猜猜我下一秒要去哪里？",
  "被你摸到啦，痒痒~",
  "嘿嘿，就喜欢和你玩耍",
  "一直陪着你，静静守着屏幕",
  "和主人贴贴最幸福"
];

// 计算动作资源目录路径
function getActionAssetFolder(action, assetsRoot, animationPrefix) {
  return path.join(assetsRoot, animationPrefix + "_" + action);
}

// 计算动作帧图目录路径
function getActionFrameFolder(action, assetsRoot, animationPrefix) {
  return path.join(getActionAssetFolder(action, assetsRoot, animationPrefix), "transparent_frames");
}

// 计算动作元数据文件路径
function getActionMetadataPath(action, assetsRoot, animationPrefix) {
  return path.join(getActionAssetFolder(action, assetsRoot, animationPrefix), "loop.json");
}

// 单个宠物状态工厂，folder/metadata 由资源路径函数计算
function buildPetState({ id, label, action, assetsRoot, animationPrefix, frameMs = 30, loopStart = 0, loopEnd = 0, defaultFacing = "left", moving = false, frameSequence = null, playback = null, greetings = sharedGreetings }) {
  const state = {
    id,
    label,
    folder: getActionFrameFolder(action, assetsRoot, animationPrefix),
    metadata: getActionMetadataPath(action, assetsRoot, animationPrefix),
    frameMs,
    loopStart,
    loopEnd,
    defaultFacing,
    moving,
    playback: playback || { mode: "continuous", completeTo: "squat", interruptible: true },
    greetings
  };
  if (frameSequence) {
    state.frameSequence = frameSequence;
  }
  return state;
}

// 从统一动作注册表派生运行时状态，避免动作定义与动作池重复维护。
function buildPetStates(actionIds, assetsRoot, animationPrefix, greetings = sharedGreetings, labelOverrides = {}, actionPool = ACTION_POOL) {
  return Object.entries(actionPool)
    .filter(([action]) => actionIds[action])
    .map(([action, definition]) => buildPetState({
    id: actionIds[action],
    label: labelOverrides[action] || definition.label,
    action,
    assetsRoot,
    animationPrefix,
    moving: definition.motion?.mode === "walk",
    frameSequence: definition.frameSequence || null,
    playback: {
      ...definition.playback,
      completeTo: actionIds[definition.playback?.completeTo] || actionIds.squat
    },
    greetings
  }));
}

module.exports = {
  sharedGreetings,
  getActionAssetFolder,
  getActionFrameFolder,
  getActionMetadataPath,
  buildPetState,
  buildPetStates
};
