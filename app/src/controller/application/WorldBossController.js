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
const worldBossTemplate = require("../../templates/application/WorldBoss");
const { model: worldBossLogModel } = require("../../model/application/WorldBossLog");
const { inventory: Inventory } = require("../../model/application/Inventory");
const { make: makeCharacter, enumSkills } = require("../../model/application/RPGCharacter");
const redis = require("../../util/redis");
const i18n = require("../../util/i18n");
const { DefaultLogger } = require("../../util/Logger");
const { delay, random } = require("../../util/index");
const LineClient = getClient("line");
const config = require("config");
const { get, sample, sortBy } = require("lodash");
const humanNumber = require("human-number");
const { format } = require("util");
const { table, getBorderCharacters } = require("table");
const { parse } = require("path");

exports.router = [
  text("#冒險小卡", myStatus),
  text("/bosslist", bosslist),
  text(["/worldboss", "#世界王"], bossEvent),
  text("/allevent", all),
  text("/worldrank", worldRank),
  text(/^[.#/](攻擊|attack)$/, withProps(attack, { attackType: "normal" })),
  text("#夢幻回歸", revokeAttack),
  text("#傷害紀錄", todayLogs),
  text(config.get("worldboss.revoke_charm"), revokeCharm),
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

  DefaultLogger.info(`${userId} 已詠唱 持續 20 秒`);
}

/**
 * 取得今日傷害紀錄
 * @param {import ("bottender").LineContext} context
 */
async function todayLogs(context) {
  const { id } = context.event.source;
  const { quoteToken } = context.event.message;
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
  const todayLogs = await worldBossEventLogService.getTodayLogs(id);
  if (todayLogs.length !== 10) {
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
  DefaultLogger.info(`${userId} 詠唱結果 ${isSuccess ? "成功" : "失敗"}`);
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
 * @returns {string|null} 正在進行中的世界事件的 ID，若無則返回 null。
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

  // 取得今日已經攻擊的次數
  const [todayAttackCount, sumLogs, { max: maxDamage = 0 }, { count: attendTimes = 0 }] =
    await Promise.all([
      worldBossEventLogService.getTodayAttackCount(id),
      worldBossLogModel.getBossLogs(id, { limit: 2 }),
      worldBossLogModel.getUserMaxDamage(id),
      worldBossLogModel.getUserAttendance(id),
    ]);

  const data = {
    level,
    expPercentage,
    name: displayName,
    image: pictureUrl,
    exp,
    attackCount: todayAttackCount,
    jobName: job_name,
    jobAdvancement: job_class_advancement,
  };

  let bubbles = [
    worldBossTemplate.generateAdventureCard(data),
    worldBossTemplate.generateCardStatusBubble({
      maxDamage: humanNumber(maxDamage || 0),
      standardDamage: humanNumber(character.getStandardDamage()),
      attendTimes: attendTimes || 0,
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
  const hasService = (context.state.services || []).includes("world_boss");
  if (isGroup && !hasService) {
    contents.unshift(worldBossTemplate.generateOshirase());
  }

  context.replyFlex(`${data.name} 的戰鬥模板`, {
    type: "carousel",
    contents,
  });
}

/**
 * @param {import ("bottender").LineContext} context
 * @param {import("bottender").Props} props
 */
const attackOnBoss = async (context, props) => {
  const { worldBossEventId, attackType = "standard" } = props.payload;
  // 從事件的 source 取得用戶資料
  const { displayName, id, userId, pictureUrl } = context.event.source;
  const hasService = (context.state.services || []).includes("world_boss");
  const isGroup = context.event.source.type === "group";
  // 決定要不要把訊息儲存起來，等待一段時間才一次發送
  const keepMessage = isGroup && !hasService;

  // 沒有會員id，跳過不處理
  if (!id) {
    DefaultLogger.info(`no member id ${userId}`);
    return;
  }

  // 判斷是否可以攻擊
  const canAttack = await isUserCanAttack(id);
  if (!canAttack) {
    DefaultLogger.info(
      `user ${displayName} can not attack ${userId}. Maybe cache or reach limit in this period.`
    );

    if (context.event.isText) {
      context.replyText(
        i18n.__("message.world_boss.can_not_attack", {
          name: displayName,
        })
      );
    }

    return;
  }

  const eventBoss = await worldBossEventService.getBossInformation(worldBossEventId);

  // 如果抓不到資料，跳過不處理
  if (!eventBoss) {
    DefaultLogger.info(`no event boss ${worldBossEventId}`);
    return;
  }

  const { name, end_time } = eventBoss;
  let { total_damage: totalDamage = 0 } =
    await worldBossEventLogService.getRemainHpByEventId(worldBossEventId);

  // 如果這個活動已經結束，則不處理
  if (moment(end_time).isBefore(moment())) {
    DefaultLogger.info(`event ${name} is ended.`);
    return;
  }

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
    !keepMessage && context.replyText(i18n.__("message.minigame_level_not_found"));
  }
  const { level, job_key: jobKey } = levelData;
  const rpgCharacter = makeCharacter(jobKey, { level });

  // 新增對 boss 攻擊紀錄
  let damage = rpgCharacter.getStandardDamage(); // 預設使用基礎攻擊
  let cost = 10; // 預設消耗的扣打
  const [attackJobKey, attackSkill] = attackType.split("|");

  if (attackJobKey !== rpgCharacter.key) {
    // 如果攻擊職業不同，則不處理
    return;
  }

  if (attackSkill === enumSkills.SKILL_ONE) {
    damage = rpgCharacter.getSkillOneDamage();
    cost = rpgCharacter.skillOne.cost;
  }

  let attributes = {
    user_id: id,
    world_boss_event_id: worldBossEventId,
    action_type: attackType,
    damage,
    cost,
  };
  await worldBossEventLogService.create(attributes);

  // 隨機取得此次攻擊的訊息樣板
  let messageTemplates = await worldBossUserAttackMessageService.all();
  let templateData = messageTemplates[Math.floor(Math.random() * messageTemplates.length)];
  let causedDamagePercent = calculateDamagePercentage(eventBoss.hp, damage);
  let earnedExp = (eventBoss.exp * causedDamagePercent) / 100;
  // 計算因等級差距的關係是否進行經驗值懲罰
  let penaltyInfo = decidePenalty({ level: eventBoss.level, userLevel: level });
  if (penaltyInfo.isPenalty) {
    earnedExp = Math.round(earnedExp * penaltyInfo.expRate);
  }
  // 計算獲得經驗後的等級狀況
  let newLevelData = await decideLevelResult({ ...levelData, earnedExp });
  // 將計算後的結果更新至資料庫
  await minigameService.updateByUserId(userId, {
    level: newLevelData.newLevel,
    exp: newLevelData.newExp,
  });

  if (newLevelData.levelUp && !keepMessage) {
    context.replyText(
      i18n.__("message.minigame_level_up", { level: newLevelData.newLevel, displayName })
    );
  }

  // 獲取今日花費 cost 並且在訊息中提示
  const { totalCost: todayCost } = await worldBossEventLogService.getTodayCost(id);
  const dailyLimit = config.get("worldboss.daily_limit");

  let iconUrl = get(templateData, "icon_url", pictureUrl);
  let messages = [
    i18n
      .__(templateData.template, {
        name,
        damage,
        display_name: displayName,
        boss_name: eventBoss.name,
      })
      .trim() + `\n_目前 cost: ${todayCost}/${dailyLimit}_`,
  ];
  let sender = { name: displayName.substr(0, 20), iconUrl };

  if (penaltyInfo.isPenalty) {
    messages.push(
      i18n.__("message.minigame_penalty", {
        penaltyRate: penaltyInfo.expRate * 100,
      })
    );
  }

  DefaultLogger.info(
    `${displayName} 造成了 ${calculateDamagePercentage(eventBoss.hp, damage)} ${JSON.stringify(
      sender
    )}`
  );

  if (keepMessage) {
    await handleKeepingMessage(worldBossEventId, context, messages.join("\n"));
  } else {
    context.replyText(messages.join("\n"), { sender });
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
    DefaultLogger.info(`keep message ${keepMessage}`);
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
async function isUserCanAttack(userId) {
  const key = `${userId}_can_attack`;
  const cooldownSeconds = 5;

  // 如果 redis 中有資料，代表一定攻擊過了
  if (await redis.get(key)) {
    return false;
  }

  // 取得今日紀錄
  const result = await worldBossEventLogService.getTodayCost(userId);
  const totalCost = parseInt(get(result, "totalCost", 0));
  // 如果完全沒有紀錄，代表可以攻擊
  if (totalCost === 0) {
    await redis.set(key, 1, {
      EX: cooldownSeconds * 1,
      NX: true,
    });
    return true;
  }

  let canAttack = totalCost < config.get("worldboss.daily_limit");
  console.log(`${userId} can attack ${canAttack}, currentCost ${totalCost}`);

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

  console.log(
    `${level} level up to ${newLevel}`,
    { levelUp, levelUpCount },
    { newExp, nextLevelExp }
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
