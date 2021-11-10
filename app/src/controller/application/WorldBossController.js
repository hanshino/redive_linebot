// eslint-disable-next-line no-unused-vars
const { Context, getClient } = require("bottender");
const { text } = require("bottender/router");
const ajv = require("../../util/ajv");
const adminModel = require("../../model/application/Admin");
const worldBossModel = require("../../model/application/WorldBoss");
const worldBossEventService = require("../../service/WorldBossEventService");
const worldBossEventLogService = require("../../service/WorldBossEventLogService");
const minigameService = require("../../service/MinigameService");
const worldBossUserAttackMessageService = require("../../service/WorldBossUserAttackMessageService");
const worldBossTemplate = require("../../templates/application/WorldBoss");
const redis = require("../../util/redis");
const i18n = require("../../util/i18n");
const { DefaultLogger } = require("../../util/Logger");
const LineClient = getClient("line");
const opencvModel = require("../../model/application/OpencvModel");

exports.router = [
  text("/bosstest", test),
  text("/bosslist", bosslist),
  text("/worldboss", bossEvent),
  text("/allevent", all),
  text("/worldrank", worldRank),
  text("/worldattacktemplate", worldAttackTemplate),
  text(/^\/(sa|systemattack)(\s(?<percentage>\d{1,2}))?$/, adminAttack),
];

async function test(context) {
  const { userId } = context.event.source;
  const { level, exp } = await minigameService.findByUserId(userId);

  context.replyText(`${level} ${exp}`);
}

async function worldAttackTemplate(context, props) {
  let templates = await worldBossUserAttackMessageService.all();

  context.replyText(JSON.stringify(templates));
}

/**
 * @param {Context} context
 * @param {import("bottender").Props} props
 */
async function worldRank(context, props) {
  // 取得正在進行中的世界事件
  const events = await worldBossEventService.getCurrentEvent();

  // 多起世界事件正在舉行中
  if (events.length > 1) {
    context.replyText(i18n.__("message.world_boss_event_multiple_ongoing"));
    return;
  } else if (events.length === 0) {
    context.replyText(i18n.__("message.world_boss_event_no_ongoing"));
    return;
  }

  let topTenData = await worldBossEventLogService.getTopTen(events[0].id);
  topTenData = await Promise.all(
    topTenData.map(async data => {
      let profile = await LineClient.getUserProfile(data.userId);
      return {
        ...data,
        ...profile,
      };
    })
  );

  context.replyText(JSON.stringify(topTenData));
}

/**
 * @param {Context} context
 * @param {import("bottender").Props} props
 */
async function adminAttack(context, props) {
  const { percentage } = props.match.groups;
  const { userId } = context.event.source;

  // 判斷是否為管理員
  const isAdmin = await adminModel.isAdmin(userId);
  if (!isAdmin) {
    return;
  }

  // 取得正在進行中的世界事件
  const events = await worldBossEventService.getCurrentEvent();

  // 多起世界事件正在舉行中
  if (events.length > 1) {
    context.replyText(i18n.__("message.world_boss_event_multiple_ongoing"));
    return;
  } else if (events.length === 0) {
    context.replyText(i18n.__("message.world_boss_event_no_ongoing"));
    return;
  }

  const data = await worldBossEventService.getEventBoss(events[0].id);
  let { total_damage: totalDamage = 0 } = await worldBossEventLogService.getRemainHpByEventId(
    data.id
  );
  let remainHp = data.hp - parseInt(totalDamage || 0);
  let hasCompleted = remainHp <= 0;

  // 如果已經完成，則不能攻擊
  if (hasCompleted) {
    context.replyText(i18n.__("message.world_boss_event_completed"));
    return;
  }

  let damage = ((parseInt(percentage) * remainHp) / 100).toFixed(0);
  let attributes = {
    user_id: 0, // 管理員用戶ID
    world_boss_event_id: data.id,
    action_type: "admin",
    damage,
  };
  await worldBossEventLogService.create(attributes);

  context.replyText(i18n.__("message.admin_attack_on_world_boss", { damage }));
}

/**
 * @param {Context} context
 */
async function all(context) {
  const data = await worldBossEventService.all({
    filters: [
      ["start_time", "<", new Date()],
      ["end_time", ">", new Date()],
    ],
  });
  context.replyText(JSON.stringify(data));
}

/**
 * @param {Context} context
 */
async function bosslist(context) {
  const data = await worldBossModel.all();
  context.replyText(JSON.stringify(data));
}

/**
 * @param {Context} context
 */
async function bossEvent(context) {
  // 取得正在進行中的世界事件
  const events = await worldBossEventService.getCurrentEvent();
  // 取得訊息來源是否能夠攻擊，目前規則為：
  // 1. 個人使用者可以攻擊
  // 2. 群組內的話，必須具備群組 world_boss 服務
  // 擁有群組權限
  const isGroup = context.event.source.type === "group";
  const hasGuildService = isGroup && context.state.services.includes("world_boss");
  const canAttack = isGroup ? hasGuildService : true;

  // 多起世界事件正在舉行中
  if (events.length > 1) {
    context.replyText(i18n.__("message.world_boss_event_multiple_ongoing"));
    return;
  } else if (events.length === 0) {
    context.replyText(i18n.__("message.world_boss_event_no_ongoing"));
    return;
  }

  let eventId = events[0].id;

  const [data, topTenData] = await Promise.all([
    worldBossEventService.getEventBoss(eventId),
    worldBossEventLogService.getTopTen(eventId),
  ]);
  let { total_damage: totalDamage = 0 } = await worldBossEventLogService.getRemainHpByEventId(
    data.id
  );
  let remainHp = data.hp - parseInt(totalDamage || 0);
  let hasCompleted = remainHp <= 0;

  // 將排名資訊，補上用戶資訊
  let topTenInfo = await Promise.all(
    topTenData.map(async data => {
      let profile = await LineClient.getUserProfile(data.userId);
      return {
        ...data,
        ...profile,
      };
    })
  );
  // 計算有效用戶的傷害
  let validDamage = topTenInfo.reduce((acc, cur) => acc + parseInt(cur.total_damage || 0), 0);
  // 計算管理員的傷害
  let adminDamage = totalDamage - validDamage;

  // 組合世界事件資訊
  const infoBubble = worldBossTemplate.generateBossInformation({ ...data, hasCompleted });
  // 組合主畫面
  const mainBubble = worldBossTemplate.generateBoss({
    ...data,
    fullHp: data.hp,
    currentHp: remainHp < 0 ? 0 : remainHp,
    hasCompleted,
    canAttack,
  });

  // 組合排名資訊
  // 先組出每列的排名資訊
  let rankBoxes = topTenInfo.map((data, index) => {
    return worldBossTemplate.generateRankBox({
      name: data.displayName || `路人${index + 1}`,
      damage: data.total_damage,
      rank: index + 1,
    });
  });

  // 將管理員傷害加入，先插入分隔線
  // 如果管理員傷害為0，則不顯示
  if (adminDamage > 0) {
    rankBoxes.push({
      type: "separator",
    });
    rankBoxes.push(
      worldBossTemplate.generateRankBox({
        name: i18n.__("template.admin"),
        damage: adminDamage,
        rank: "?",
      })
    );
  }

  // 再組出排名資訊的總結
  const rankBubble = worldBossTemplate.generateTopTenRank(rankBoxes);

  const contents = [mainBubble, infoBubble, rankBubble];
  if (canAttack === false) {
    // 如果不能攻擊，則插入一個 bubble 在最前面
    contents.unshift(worldBossTemplate.generateOshirase());
  }

  context.replyFlex(`${data.name} 的戰鬥模板`, {
    type: "carousel",
    contents,
  });
}

/**
 * @param {Context} context
 * @param {import("bottender").Props} props
 */
exports.attackOnBoss = async (context, props) => {
  const { worldBossEventId } = props.payload;
  // 從事件的 source 取得用戶資料
  const { displayName, id, userId } = context.event.source;

  // 沒有會員id，跳過不處理
  if (!id) {
    DefaultLogger.info(`no member id ${userId}`);
    return;
  }

  // 判斷是否可以攻擊
  const canAttack = await isUserCanAttack(userId);
  if (!canAttack && process.env.NODE_ENV === "production") {
    DefaultLogger.info(`user ${displayName} can not attack in 10 minutes ${userId}`);
    return;
  }

  const eventBoss = await worldBossEventService.getBossInformation(worldBossEventId);
  const { name } = eventBoss;
  let { total_damage: totalDamage = 0 } = await worldBossEventLogService.getRemainHpByEventId(
    worldBossEventId
  );

  // 如果此王已經死亡，則不處理
  let remainHp = eventBoss.hp - parseInt(totalDamage || 0);
  if (remainHp <= 0) {
    DefaultLogger.info(
      `boss is dead ${displayName} skip, boss hp ${eventBoss.hp}, totaldamage ${totalDamage}`
    );
    return;
  }

  // 取得用戶等級
  let levelData = await minigameService.findByUserId(userId);
  if (!levelData) {
    DefaultLogger.info(`no level data ${userId}. Create One.`);
    await minigameService.createByUserId(userId, minigameService.defaultData);
    levelData = minigameService.defaultData;
    context.replyText(i18n.__("message.minigame_level_not_found"));
  }

  const { level } = levelData;

  // 新增對 boss 攻擊紀錄
  let damage = calculateDamage(level);

  let attributes = {
    user_id: id,
    world_boss_event_id: worldBossEventId,
    action_type: "normal",
    damage,
  };
  await worldBossEventLogService.create(attributes);

  // 隨機取得此次攻擊的訊息樣板
  let messageTemplates = await worldBossUserAttackMessageService.all();
  let templateData = messageTemplates[Math.floor(Math.random() * messageTemplates.length)];
  let causedDamagePercent = calculateDamagePercentage(eventBoss.hp, damage);
  let earnedExp = (eventBoss.exp * causedDamagePercent) / 100;
  // 計算獲得經驗後的等級狀況
  let newLevelData = await decideLevelResult({ ...levelData, earnedExp });
  // 將計算後的結果更新至資料庫
  await minigameService.updateByUserId(userId, {
    level: newLevelData.newLevel,
    exp: newLevelData.newExp,
  });

  if (newLevelData.levelUp) {
    context.replyText(
      i18n.__("message.minigame_level_up", { level: newLevelData.newLevel, displayName })
    );
  }

  let message = i18n.__(templateData.template, { name, damage, display_name: displayName });
  let sender = { name: displayName.substr(0, 20), iconUrl: templateData.icon_url };

  DefaultLogger.info(
    `${message} 造成了 ${calculateDamagePercentage(eventBoss.hp, damage)} ${JSON.stringify(sender)}`
  );

  context.replyText(message, { sender });
};

/**
 * 判斷是否可以攻擊
 * @param {String} userId
 * @returns {Promise<Boolean>}
 */
async function isUserCanAttack(userId) {
  const key = `${userId}_can_attack`;

  // 使用 setnx 判斷是否為10分鐘內第一次攻擊
  const isFirstAttack = await redis.setnx(key, 1);

  // 如果是第一次攻擊，則設定10分鐘後自動清除
  if (isFirstAttack) {
    redis.expire(key, 10 * 60);
  }

  // 如果不是第一次攻擊，則不能攻擊
  if (!isFirstAttack) {
    return false;
  }

  return true;
}

/**
 * 透過等級計算攻擊傷害
 * @param {Number} level 等級
 * @returns {Number} 攻擊傷害
 */
function calculateDamage(level = 1) {
  // 根據等級計算攻擊傷害，攻擊係數呈指數增加
  // 等級也具有基礎傷害，所以等級越高，傷害越高，使用等級 * 10 當作基底傷害
  // 最後再加上隨機值，避免每次都是同一個傷害
  let damage = Math.floor(Math.pow(level, 2) * 2) + level * 10 + Math.floor(Math.random() * level);
  return damage;
}

/**
 * 計算攻擊傷害占比
 */
function calculateDamagePercentage(bossHp, damage) {
  return (damage / bossHp) * 100;
}

/**
 * @typedef {Object} LevelResult
 * @property {Boolean} levelUp 是否升級
 * @property {Number} newLevel 新的等級
 * @property {Number} newExp 新的經驗值
 * @property {Number} levelUpCount 升級次數
 * @property {Number} nextLevelExp 下一級所需經驗值
 * 決定等級結果
 * @param {Object} param0
 * @param {Number} param0.level 等級
 * @returns {Promise<LevelResult>}
 */
async function decideLevelResult({ level, exp, earnedExp }) {
  let newLevel = level;
  let newExp = exp + earnedExp;
  let levelUp = false;
  // 紀錄提升的等級次數
  let levelUpCount = 0;

  // 取得等級經驗表
  let levelExpList = await minigameService.getLevelUnit();

  // 取得目前等級要升級到的經驗值
  let nextLevelExp = levelExpList.find(data => data.level == level + 1).max_exp;

  // 如果目前經驗值大於等級升級所需經驗值，則升級
  // 也要判斷總共升級幾次
  while (newExp >= nextLevelExp) {
    newLevel++;
    newExp -= nextLevelExp;
    nextLevelExp = levelExpList.find(data => data.level == newLevel + 1).max_exp;
    levelUpCount++;
    levelUp = true;
  }

  return {
    levelUp,
    newLevel,
    newExp,
    levelUpCount,
    nextLevelExp,
  };
}

const api = {};
exports.api = api;

/**
 * 新增一筆特色攻擊訊息
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
api.createAttackMessage = async (req, res) => {
  const { body } = req;
  const validate = ajv.getSchema("createUserAttackMessage");
  const valid = validate(body);

  if (!valid) {
    return res.status(400).json({
      message: validate.errors,
    });
  }

  const { icon_url, template } = body;

  try {
    await worldBossUserAttackMessageService.create({
      icon_url,
      template,
      creator_id: req.profile.ID,
    });
  } catch (e) {
    return res.status(500).json({
      message: e.message,
    });
  }

  return res.status(200).json({
    message: "success",
  });
};

/**
 * 列出特色攻擊訊息
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
api.listAttackMessage = async (req, res) => {
  const data = await worldBossUserAttackMessageService.all();
  return res.status(200).json({
    message: "success",
    data,
  });
};

/**
 * 根據事件id取得輸出排行榜的圖片
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
api.genTopTenRankChart = async (req, res) => {
  const { eventId } = req.query;
  const [rawData, bossData, { total_damage: totalDamage }] = await Promise.all([
    worldBossEventLogService.getTopTen(eventId),
    worldBossEventService.getBossInformation(eventId),
    worldBossEventLogService.getRemainHpByEventId(eventId),
  ]);

  // 將排名資訊，補上用戶資訊
  let topTenInfo = await Promise.all(
    rawData.map(async data => {
      let profile = await LineClient.getUserProfile(data.userId);
      return {
        ...data,
        ...profile,
      };
    })
  );

  // 組出 python 所需的資料格式
  const topData = topTenInfo.map((data, index) => ({
    display_name: data.displayName || `路人${index + 1}`,
    total_damage: parseInt(data.total_damage),
  }));

  // 呼叫 python 取得圖片
  const imageBase64 = await opencvModel.generateRankImage({
    top_data: topData,
    boss: { ...bossData, caused_damage: parseInt(totalDamage) },
  });

  res.setHeader("Content-Type", "image/png");
  res.send(Buffer.from(imageBase64, "base64"));
};
