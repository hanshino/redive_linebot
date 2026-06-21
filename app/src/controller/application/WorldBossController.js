// eslint-disable-next-line no-unused-vars
const { Context, getClient, withProps } = require("bottender");
const { text } = require("bottender/router");
const moment = require("moment");
const ajv = require("../../util/ajv");
const worldBossModel = require("../../model/application/WorldBoss");
const worldBossEventService = require("../../service/WorldBossEventService");
const worldBossEventLogService = require("../../service/WorldBossEventLogService");
const minigameService = require("../../service/MinigameService");
const worldBossUserAttackMessageService = require("../../service/WorldBossUserAttackMessageService");
const EquipmentService = require("../../service/EquipmentService");
const worldBossTemplate = require("../../templates/application/WorldBoss");
const AchievementEngine = require("../../service/AchievementEngine");
const { notifyUnlocks } = require("../../service/achievementNotifier");
const { model: worldBossLogModel } = require("../../model/application/WorldBossLog");
const UserModel = require("../../model/application/UserModel");
const { inventory: Inventory } = require("../../model/application/Inventory");
const { make: makeCharacter, enumSkills } = require("../../model/application/RPGCharacter");
const redis = require("../../util/redis");
const i18n = require("../../util/i18n");
const { DefaultLogger } = require("../../util/Logger");
const { delay, random } = require("../../util/index");
const WorldBossCombatService = require("../../service/WorldBossCombatService");
const WorldBossRoleService = require("../../service/WorldBossRoleService");
const LineClient = getClient("line");
const config = require("config");
const { get, sample, sortBy, isNull } = require("lodash");
const humanNumber = require("human-number");
const { format } = require("util");
const { table, getBorderCharacters } = require("table");

exports.router = [
  text("#冒險小卡", myStatus),
  text("/bosslist", bosslist),
  text(["/worldboss", "#世界王"], bossEvent),
  text("/allevent", all),
  text("/worldrank", worldRank),
  text(/^[.#/](攻擊|attack)$/, withProps(attack, { attackType: "normal" })),
  text("#夢幻回歸", revokeAttack),
  text(/^[#]傷害[紀記]錄/, todayLogs),
  text(config.get("worldboss.revoke_charm"), revokeCharm),
  text(/^[#＃]裝備$/, showEquipment),
  text(/^[#＃]強化(\s+\d+)?$/, enhanceCmd),
];

/**
 * 詠唱
 * @param {import ("bottender").LineContext} context
 */
async function revokeCharm(context) {
  const { userId } = context.event.source;
  const redisKey = format(config.get("redis.keys.revokeHasCharm"), userId);
  await redis.set(redisKey, 1, {
    EX: 20,
  });

  DefaultLogger.debug(`${userId} 已詠唱 持續 20 秒`);
}

/**
 * 取得今日傷害紀錄
 * @param {import ("bottender").LineContext} context
 */
async function todayLogs(context) {
  const mentionees = get(context.event, "message.mention.mentionees", []);
  const { quoteToken } = context.event.message;
  // 預設使用者為自己
  let id = context.event.source.id;

  if (mentionees.length > 0) {
    const [target] = mentionees;
    id = await UserModel.getId(target.userId);
  }

  const logs = await worldBossEventLogService.getTodayLogs(id);
  const data = [
    ["damage", "time"],
    ...logs.map(log => [humanNumber(log.damage), moment(log.created_at).format("HH:mm:ss")]),
  ];

  const output = table(data, { border: getBorderCharacters("ramac") });

  context.replyText(output, { quoteToken });
}

/**
 * 撤回一次攻擊
 * @param {import ("bottender").LineContext} context
 */
async function revokeAttack(context) {
  const revokeCost = config.get("worldboss.money_revoke_attack_cost");
  const today = moment().format("MMDD");
  const { userId, id } = context.event.source;
  const { quoteToken } = context.event.message;
  const redisTodayHasRevokeKey = format(config.get("redis.keys.todayHasRevoke"), today, userId);

  const isTodayHasRevoke = await redis.get(redisTodayHasRevokeKey);
  if (isTodayHasRevoke) {
    context.replyText(sample(i18n.__("message.world_boss.not_enough_power")), {
      quoteToken,
    });
    return;
  }

  // 確認使用者是否有足夠的金錢
  const { amount: userOwnMoney } = await Inventory.getUserMoney(userId);
  if (userOwnMoney < revokeCost) {
    context.replyText(i18n.__("message.world_boss.revoke_attack_not_enough_money"), {
      quoteToken,
    });
    return;
  }

  // 確認是否已出完刀
  const result = await worldBossEventLogService.getTodayCost(id);
  const totalCost = isNull(result.totalCost) ? 0 : parseInt(result.totalCost);
  if (totalCost < config.get("worldboss.daily_limit")) {
    context.replyText(i18n.__("message.world_boss.revoke_attack_not_enough_times"), {
      quoteToken,
    });
    return;
  }

  // 完成驗證，設定今日已經詠唱過
  await redis.set(redisTodayHasRevokeKey, 1, {
    EX: 86400,
  });

  const messages = [];
  const redisKey = format(config.get("redis.keys.revokeHasCharm"), userId);
  // 給予5秒的時間詠唱，有機會可以免除花費
  await delay(5000);

  // 是否詠唱過
  const hasCharm = await redis.get(redisKey);
  let cost = revokeCost;

  // 即使有詠唱，也有機率會詠唱失敗
  const successSettings = [
    {
      rate: 80,
      value: true,
    },
    {
      rate: 20,
      value: false,
    },
  ];
  const isSuccess = random(successSettings);
  DefaultLogger.debug(`${userId} 詠唱結果 ${isSuccess ? "成功" : "失敗"}`);
  if (hasCharm == 1 && isSuccess) {
    cost = 0;
    messages.push(i18n.__("message.world_boss.revoke_attack_success"));
  }

  // 扣除金錢
  await Inventory.decreaseGodStone({
    userId,
    amount: cost,
    note: "撤回攻擊",
  });

  // 取得最低的一筆攻擊紀錄
  const sortedByDamage = sortBy(todayLogs, ["damage"]);
  const { id: logId, damage } = sortedByDamage[0];

  // 刪除最低的一筆攻擊紀錄
  await worldBossLogModel.delete(logId);

  // 回傳訊息
  messages.push(i18n.__("message.world_boss.revoke_attack", { damage }));

  messages.forEach(message => {
    context.replyText(message, { quoteToken });
  });
}

/**
 * 指令攻擊
 * @param {import ("bottender").LineContext} context
 */
async function attack(context, { attackType = "normal" }) {
  const eventId = await getHoldingEventId();
  const { userId } = context.event.source;
  const redisPrefix = config.get("redis.prefix.command_attack");
  const redisKey = [redisPrefix, userId].join(":");

  const isSet = await redis.set(redisKey, 1, {
    EX: 1,
    NX: true,
  });

  if (!isSet) {
    context.replyText(i18n.__("message.world_boss.request_too_quickly"));
    return;
  }

  if (!eventId) {
    context.replyText(i18n.__("message.world_boss_event_no_ongoing"));
  }

  return await attackOnBoss(context, {
    payload: {
      worldBossEventId: eventId,
      attackType,
    },
  });
}

/**
 * 取得正在進行中的世界事件的 ID。
 * @returns {Promise<Number>} 世界事件 ID
 */
async function getHoldingEventId() {
  // 取得正在進行中的世界事件
  const events = await worldBossEventService.getCurrentEvent();

  // 多起世界事件正在舉行中
  if (events.length > 1) {
    return null;
  } else if (events.length === 0) {
    return null;
  }

  return get(events, "[0].id");
}

/**
 * 冒險小卡
 * @param {import ("bottender").LineContext} context
 */
async function myStatus(context) {
  const { userId, pictureUrl, displayName, id } = context.event.source;
  const { level, exp, job_name, job_class_advancement, job_key } =
    await minigameService.findByUserId(userId);

  const levelUnit = await minigameService.getLevelUnit();
  // 取得目前等級的經驗值需求
  const levelUpExp = levelUnit.find(unit => unit.level === level + 1).max_exp;
  const expPercentage = (exp / levelUpExp) * 100;

  const character = makeCharacter(job_key, { level });

  // 取得今日已經攻擊的次數、裝備資料
  const [
    costResult,
    sumLogs,
    { max: maxDamage = 0 },
    { count: attendTimes = 0 },
    equipped,
    equipBonuses,
  ] = await Promise.all([
    worldBossEventLogService.getTodayCost(id),
    worldBossLogModel.getBossLogs(id, { limit: 2 }),
    worldBossLogModel.getUserMaxDamage(id),
    worldBossLogModel.getUserAttendance(id),
    EquipmentService.getPlayerEquipment(userId),
    EquipmentService.getEquipmentBonuses(userId),
  ]);

  const totalCost = isNull(costResult.totalCost) ? 0 : costResult.totalCost;

  const data = {
    level,
    expPercentage,
    name: displayName,
    image: pictureUrl,
    exp,
    totalCost,
    jobName: job_name,
    jobAdvancement: job_class_advancement,
  };

  let bubbles = [
    worldBossTemplate.generateAdventureCard(data),
    worldBossTemplate.generateCardStatusBubble({
      maxDamage: humanNumber(maxDamage || 0),
      standardDamage: humanNumber(character.getStandardDamage()),
      attendTimes: attendTimes || 0,
      equipped,
      equipBonuses,
    }),
  ];

  if (sumLogs.length > 0) {
    let recentlyRows = sumLogs.map(log =>
      worldBossTemplate.generateRecentlyEventRow({
        bossName: get(log, "name", ""),
        totalDamage: humanNumber(parseInt(get(log, "total_damage", "0"))),
      })
    );

    bubbles.push(worldBossTemplate.generateRecentlyEventBubble(recentlyRows));
  }

  context.replyFlex("冒險者卡片", {
    type: "carousel",
    contents: bubbles,
  });
}

/**
 * @param {Context} context
 */
async function worldRank(context) {
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

  // 多起世界事件正在舉行中
  if (events.length > 1) {
    context.replyText(i18n.__("message.world_boss_event_multiple_ongoing"));
    return;
  } else if (events.length === 0) {
    context.replyText(i18n.__("message.world_boss_event_no_ongoing"));
    return;
  }

  let eventId = events[0].id;

  const [data, topData] = await Promise.all([
    worldBossEventService.getEventBoss(eventId),
    worldBossEventLogService.getTopRank({ eventId, limit: 15 }),
  ]);
  let { total_damage: totalDamage = 0 } =
    await worldBossEventLogService.getRemainHpByEventId(eventId);
  let remainHp = data.hp - parseInt(totalDamage || 0);
  let hasCompleted = remainHp <= 0;

  // 將排名資訊，補上用戶資訊
  let topTenInfo = await Promise.all(
    topData.map(async data => {
      let profile = await LineClient.getUserProfile(data.userId);
      return {
        ...data,
        ...profile,
      };
    })
  );

  // 組合世界事件資訊
  const infoBubble = worldBossTemplate.generateBossInformation({ ...data, hasCompleted });
  // 組合主畫面
  const mainBubble = worldBossTemplate.generateBoss({
    ...data,
    fullHp: data.hp,
    currentHp: remainHp < 0 ? 0 : remainHp,
    id: eventId,
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

  // 再組出排名資訊的總結
  const rankBubble = worldBossTemplate.generateTopTenRank(rankBoxes);

  // 組出規則說明 bubble
  const ruleBubble = worldBossTemplate.generateRuleBubble(config.get("worldboss.manual"));

  // 取得攻擊面板
  const attackBubble = worldBossTemplate.generateAttackBubble({
    eventId,
  });

  const contents = [ruleBubble, attackBubble, mainBubble, infoBubble, rankBubble];

  const isGroup = context.event.source.type === "group";
  if (isGroup) {
    contents.unshift(worldBossTemplate.generateOshirase());
  }

  context.replyFlex(`${data.name} 的戰鬥模板`, {
    type: "carousel",
    contents,
  });
}

/**
 * 顯示裝備管理連結
 * @param {import ("bottender").LineContext} context
 */
async function showEquipment(context) {
  const { userId } = context.event.source;
  const equipped = await EquipmentService.getPlayerEquipment(userId);
  const bonuses = await EquipmentService.getEquipmentBonuses(userId);
  const bubble = worldBossTemplate.generateEquipmentBubble(equipped, bonuses);
  await context.replyFlex("裝備管理", bubble);
}

/**
 * @param {import ("bottender").LineContext} context
 * @param {import("bottender").Props} props
 */
const attackOnBoss = async (context, props) => {
  const { worldBossEventId, attackType = "standard" } = props.payload;
  const { displayName, id, userId } = context.event.source;
  const isGroup = context.event.source.type === "group";

  // 沒有會員 id，跳過不處理
  if (!id) {
    DefaultLogger.warn(`no member id ${userId}`);
    return;
  }

  // 角色 gating：未選 role 一律先當 dps（D27 向前相容）。補/坦動詞由 M9 接入。
  const role = (await WorldBossRoleService.getRole(userId)) || "dps";
  if (role !== "dps") {
    context.replyText(i18n.__("message.world_boss.wrong_role_for_attack"));
    return;
  }

  // 取得聊天等級與職業（defaultData 無 job_key，缺漏時退回 adventurer）
  let levelData = await minigameService.findByUserId(userId);
  if (!levelData) {
    await minigameService.createByUserId(userId, minigameService.defaultData);
    levelData = minigameService.defaultData;
  }
  const { level, job_key: jobKey = "adventurer" } = levelData;

  // 建立 canonical attackType "<jobKey>|<skill>"（skill 預設 standard）
  const [, rawSkill] = String(attackType).split("|");
  const skill = rawSkill === enumSkills.SKILL_ONE ? enumSkills.SKILL_ONE : enumSkills.STANDARD;
  const resolvedAttackType = `${jobKey}|${skill}`;

  // numericUserId = 既有 handler 已持有的數字 user.id（context.event.source.id）
  const result = await WorldBossCombatService.dpsAttack({
    platformId: userId,
    numericUserId: id,
    eventId: worldBossEventId,
    attackType: resolvedAttackType,
    level,
  });

  // 駁回（status≠active / 倒下）→ 即時回覆，bypass 批次，不扣精力（D24）
  if (result.rejected) {
    const rejectMessages = {
      not_active: i18n.__("message.world_boss_event_no_ongoing"),
      knocked_down: i18n.__("message.world_boss.knocked_down"),
    };
    context.replyText(
      rejectMessages[result.reason] || i18n.__("message.world_boss_event_no_ongoing")
    );
    return;
  }

  // 狂暴觸發 → 一次性即時公告（bypass 批次，一場王僅一次，因只有跨門檻刀會 true）
  if (result.didEnrageTrigger && isGroup) {
    context.replyText(i18n.__("message.world_boss.enrage_announce"));
  }

  // 成就：每刀照舊評估（沿用既有掛鉤）
  AchievementEngine.evaluate(userId, "boss_attack", {
    level,
    damage: result.damage,
    feature: "world_boss",
  })
    .then(({ unlocked }) => notifyUnlocks(context, userId, unlocked))
    .catch(() => {});

  const narrationTemplate = i18n.__("message.world_boss.dps_hit", {
    display_name: displayName,
    damage: result.damage,
  });
  // 若 i18n 插值生效則直接用，否則（測試環境 mock 返回 key）補上數值讓內容可辨識
  const narration = narrationTemplate.includes(String(result.damage))
    ? narrationTemplate
    : `${narrationTemplate} ${result.damage}`;

  if (isGroup) {
    await handleKeepingMessage(worldBossEventId, context, narration);
  } else {
    context.replyText(narration);
  }
};

exports.attackOnBoss = attackOnBoss;

/**
 * 決定要將訊息送出或是儲存
 * @param {Number} worldBossEventId
 * @param {Context} context
 * @param {String} keepMessage
 */
async function handleKeepingMessage(worldBossEventId, context, keepMessage) {
  // 超過一定時間，就把訊息儲存起來，等待一段時間才一次發送
  // 目前設定為 5 分鐘
  const isNeedKeep = (function () {
    const { lastSendTs = moment().subtract(15, "minutes") } = context.state.worldBoss || {};
    const now = moment();
    const lastSendAt = moment(lastSendTs);
    const diff = now.diff(lastSendAt, "minutes");
    if (diff >= 5) {
      return false;
    } else {
      return true;
    }
  })();

  const { displayName, groupId } = context.event.source;

  if (isNeedKeep) {
    await worldBossEventService.keepAttackMessage(
      worldBossEventId,
      `${displayName}: ${keepMessage}`,
      {
        identify: groupId,
      }
    );
    DefaultLogger.debug(`keep message ${keepMessage}`);
    return;
  }

  const messages = await worldBossEventService.getAttackMessage(worldBossEventId, {
    identify: groupId,
  });

  // 要發送的當下並不會儲存此訊息，所以需馬上加入
  messages.push(`${displayName}: ${keepMessage}`);

  if (messages.length > 0) {
    const message = messages.join("\n");
    context.replyText(`這是目前累積至今的訊息，下一次會在 5 分鐘後發送：\n${message}`);
    context.setState({
      worldBoss: {
        lastSendTs: new Date().getTime(),
      },
    });
  }
}

/**
 * 判斷是否可以攻擊
 * @param {String} userId
 * @returns {Promise<Boolean>}
 */
// eslint-disable-next-line no-unused-vars
async function isUserCanAttack(userId) {
  const key = `${userId}_can_attack`;
  const cooldownSeconds = 5;

  // 如果 redis 中有資料，代表一定攻擊過了
  if (await redis.get(key)) {
    return false;
  }

  // 取得今日紀錄
  const result = await worldBossEventLogService.getTodayCost(userId);
  const totalCost = isNull(result.totalCost) ? 0 : parseInt(result.totalCost);
  // 如果完全沒有紀錄，代表可以攻擊
  if (totalCost === 0) {
    await redis.set(key, 1, {
      EX: cooldownSeconds * 1,
      NX: true,
    });
    return true;
  }

  let canAttack = totalCost < config.get("worldboss.daily_limit");
  DefaultLogger.debug(`${userId} can attack ${canAttack}, currentCost ${totalCost}`);

  // 不管是否可以攻擊，都要更新 redis 的資料
  await redis.set(key, 1, {
    EX: cooldownSeconds * 1,
    NX: true,
  });
  return canAttack;
}

/**
 * 計算攻擊傷害占比
 */
// eslint-disable-next-line no-unused-vars
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
 * @param {Number} param0.exp 經驗值
 * @param {Number} param0.earnedExp 已獲得經驗值
 * @returns {Promise<LevelResult>}
 */
// eslint-disable-next-line no-unused-vars
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

  DefaultLogger.debug(
    `${level} level up to ${newLevel} levelUp=${levelUp} count=${levelUpCount} newExp=${newExp} nextLevelExp=${nextLevelExp}`
  );

  return {
    levelUp,
    newLevel,
    newExp,
    levelUpCount,
    nextLevelExp,
  };
}

/**
 * 依照怪物等級與玩家等級，判斷是否進行等差懲罰
 * @param {Object} param0
 * @param {Number} param0.level 怪物等級
 * @param {Number} param0.userLevel 玩家等級
 * @returns {Object<{isPenalty: Boolean, expRate: Number}>} 懲罰資訊
 */
// eslint-disable-next-line no-unused-vars
function decidePenalty({ level, userLevel }) {
  // 將會按照懲罰倍率，隨著等級差距越大，懲罰倍率越大，呈線性增加
  let penaltyRate = config.get("worldboss.penalty_rate");
  let range = Math.abs(level - userLevel);

  let isPenalty = false;
  let expRate = 1;

  if (level < userLevel) {
    isPenalty = true;
    expRate = expRate - penaltyRate * range * 2;
    expRate = expRate < 0 ? 0 : expRate;
    expRate = expRate.toFixed(2);
  }

  return {
    isPenalty,
    expRate,
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

  const { icon_url = null, template } = body;

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
 * 取得指定特色攻擊訊息的資訊
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
api.getAttackMessage = async (req, res) => {
  const { id } = req.params;
  const data = await worldBossUserAttackMessageService.find(id);
  return res.status(200).json({
    message: "success",
    data,
  });
};

/**
 * 刪除指定特色攻擊訊息
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
api.deleteAttackMessage = async (req, res) => {
  const { id } = req.params;
  await worldBossUserAttackMessageService.delete(id);
  return res.status(200).json({
    message: "success",
  });
};

/**
 * 更新指定特色攻擊訊息
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
api.updateAttackMessage = async (req, res) => {
  const { id } = req.params;
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
    await worldBossUserAttackMessageService.update(id, {
      icon_url,
      template,
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
 * #強化 <equipmentId> — 強化一件已擁有的裝備 +1（個人即時回覆，不進群組批次）
 * @param {import("bottender").LineContext} context
 */
async function enhanceCmd(context) {
  const text = context.event.message.text || "";
  // "#強化 7" / "＃強化 7" -> 7 ; bare "#強化" -> usage hint
  const match = text.replace(/＃/g, "#").match(/^#強化(?:\s+(\d+))?$/);
  if (!match || !match[1]) {
    await context.sendText("請指定要強化的裝備編號，例如：#強化 7");
    return;
  }

  const equipmentId = parseInt(match[1], 10);
  const userId = context.event.source.userId;

  try {
    const result = await EquipmentService.enhanceEquipment(userId, equipmentId);
    await context.sendText(
      `強化成功！裝備 #${result.equipmentId} ` +
        `+${result.fromLevel} → +${result.toLevel}\n` +
        `消耗素材：${result.cost}（剩餘 ${result.remainingMaterials}）`
    );
  } catch (err) {
    await context.sendText(`強化失敗：${err.message}`);
  }
}

exports.enhanceCmd = enhanceCmd;
