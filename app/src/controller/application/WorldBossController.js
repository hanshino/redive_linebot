// eslint-disable-next-line no-unused-vars
const { Context, getClient, withProps } = require("bottender");
const { text } = require("bottender/router");
const moment = require("moment");
const ajv = require("../../util/ajv");
const adminModel = require("../../model/application/Admin");
const worldBossModel = require("../../model/application/WorldBoss");
const worldBossEventService = require("../../service/WorldBossEventService");
const worldBossEventLogService = require("../../service/WorldBossEventLogService");
const minigameService = require("../../service/MinigameService");
const worldBossUserAttackMessageService = require("../../service/WorldBossUserAttackMessageService");
const worldBossTemplate = require("../../templates/application/WorldBoss");
const { model: worldBossLogModel } = require("../../model/application/WorldBossLog");
const { inventory: Inventory } = require("../../model/application/Inventory");
const redis = require("../../util/redis");
const i18n = require("../../util/i18n");
const { DefaultLogger } = require("../../util/Logger");
const LineClient = getClient("line");
const opencvModel = require("../../model/application/OpencvModel");
const config = require("config");
const { get, sample } = require("lodash");
const humanNumber = require("human-number");

exports.router = [
  text("#冒險小卡", myStatus),
  text("/bosslist", bosslist),
  text(["/worldboss", "#世界王"], bossEvent),
  text("/allevent", all),
  text("/worldrank", worldRank),
  text(/^\/(sa|systemattack)(\s(?<percentage>\d{1,2}))?$/, adminAttack),
  text(/^[.#/](攻擊|attack)$/, withProps(attack, { attackType: "normal" })),
  text(/^[.#/](混[沌頓]攻擊|chaos[-_]?attack)$/, withProps(attack, { attackType: "chaos" })),
  text(/^[.#/](課金(攻擊|之力)|money[-_]?attack)$/, withProps(attack, { attackType: "money" })),
  text(
    /^[.#/](混亂(攻擊|之力)|money[-_]?chaos[-_]?attack)$/,
    withProps(attack, { attackType: "moneyChaos" })
  ),
];

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
  const { level, exp } = await minigameService.findByUserId(userId);

  const levelUnit = await minigameService.getLevelUnit();
  // 取得目前等級的經驗值需求
  const levelUpExp = levelUnit.find(unit => unit.level === level + 1).max_exp;
  const expPercentage = (exp / levelUpExp) * 100;

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
  };

  let bubbles = [
    worldBossTemplate.generateAdventureCard(data),
    worldBossTemplate.generateCardStatusBubble({
      maxDamage: humanNumber(maxDamage || 0),
      standardDamage: humanNumber(getStandardDamage(level)),
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
    events[0].id
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
    world_boss_event_id: events[0].id,
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
  let { total_damage: totalDamage = 0 } = await worldBossEventLogService.getRemainHpByEventId(
    eventId
  );
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
    hasCompleted,
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

  const contents = [ruleBubble, mainBubble, infoBubble, rankBubble];

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
 * @param {Context} context
 * @param {import("bottender").Props} props
 */
exports.adminSpecialAttack = async (context, { payload }) => {
  const { userId } = context.event.source;
  const admin = await adminModel.find(userId);

  if (!admin) {
    DefaultLogger.info(`${userId} is not admin. And click admin special attack`);
    return;
  }

  if (admin.privilege !== "9") {
    DefaultLogger.info(
      `${userId} is admin. And click admin special attack. But privilege insufficient`
    );
    return;
  }

  const { worldBossEventId, percentage } = payload;
  const event = await worldBossEventService.getEventBoss(worldBossEventId);
  const { hp } = event;

  const causeDamage = ((parseInt(percentage) * hp) / 100).toFixed(0);

  DefaultLogger.info(
    `${userId} is admin. And click admin special attack. And cause ${causeDamage} damage`
  );

  let attributes = {
    user_id: 0, // 管理員用戶ID
    world_boss_event_id: worldBossEventId,
    action_type: "admin",
    damage: causeDamage,
  };
  await worldBossEventLogService.create(attributes);

  context.replyText(`造成了 ${causeDamage} 傷害`, {
    sender: {
      name: "エリス",
      iconUrl:
        "https://media.discordapp.net/attachments/798811827772981268/909817378911698984/123.png",
    },
  });
};

/**
 * @param {import ("bottender").LineContext} context
 * @param {import("bottender").Props} props
 */
const attackOnBoss = async (context, props) => {
  const { worldBossEventId, attackType = "normal" } = props.payload;
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
  let { total_damage: totalDamage = 0 } = await worldBossEventLogService.getRemainHpByEventId(
    worldBossEventId
  );

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

  if (["money", "moneyChaos"].includes(attackType)) {
    const { amount: userOwnMoney } = await Inventory.getUserMoney(userId);
    const moneyMap = {
      money: config.get("worldboss.money_attack_cost"),
      moneyChaos: config.get("worldboss.money_chaos_attack_cost"),
    };
    const needMoney = moneyMap[attackType];
    // 看今天打幾次了，前三次可以免除消耗
    const todayLogs = await worldBossEventLogService.getTodayLogs(id);
    const hasFreeQuota = todayLogs.length < 3;

    // 如果沒有免費次數，且用戶沒有足夠的金錢，則不處理
    if (hasFreeQuota === false && userOwnMoney < needMoney) {
      if (context.event.isText) {
        const message = sample(i18n.__("message.world_boss.money_attack_not_enough"));
        context.replyText(message, {
          sender: {
            iconUrl: pictureUrl,
            name: displayName,
          },
        });
      }
      return;
    }

    if (hasFreeQuota) {
      DefaultLogger.info(`today attack ${todayLogs.length} times, skip money cost`);
      context.replyText(i18n.__("message.world_boss.money_attack_free"));
    } else {
      await Inventory.decreaseGodStone({
        userId,
        amount: needMoney,
        note: "課金攻擊",
      });
    }
  }

  const { level } = levelData;

  // 新增對 boss 攻擊紀錄
  let damage = calculateDamage(level, attackType, id);

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

  let iconUrl = templateData.icon_url || pictureUrl;
  let messages = [
    i18n
      .__(templateData.template, {
        name,
        damage,
        display_name: displayName,
        boss_name: eventBoss.name,
      })
      .trim(),
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
  const cooldownSeconds = 30;

  // 如果 redis 中有資料，代表一定攻擊過了
  if (await redis.get(key)) {
    return false;
  }

  // 取得今日紀錄
  let todayLogs = await worldBossEventLogService.getTodayLogs(userId);
  // 如果完全沒有紀錄，代表可以攻擊
  if (todayLogs.length === 0) {
    await redis.set(key, 1, {
      EX: cooldownSeconds * 1,
      NX: true,
    });
    return true;
  }

  let currentCount = todayLogs.length;
  let canAttack = currentCount < config.get("worldboss.daily_limit");
  console.log(`${userId} can attack ${canAttack}, currentCount ${currentCount}`);

  // 不管是否可以攻擊，都要更新 redis 的資料
  await redis.set(key, 1, {
    EX: cooldownSeconds * 1,
    NX: true,
  });
  return canAttack;
}

/**
 * 透過等級計算攻擊傷害
 * @param {Number} level 等級
 * @param {String} attackType 攻擊類型
 * @returns {Number} 攻擊傷害
 */
function calculateDamage(level = 1, attackType = "normal", id) {
  // 根據等級計算攻擊傷害，攻擊係數呈指數增加
  // 等級也具有基礎傷害，所以等級越高，傷害越高，使用等級 * 10 當作基底傷害
  // 最後再加上隨機值，避免每次都是同一個傷害
  let damage = getStandardDamage(level) + Math.floor(Math.random() * level);
  let rateConfig = { min: 100, max: 100 };

  switch (attackType) {
    case "chaos": {
      rateConfig = getRandomConfigByRandomStack(config.get("worldboss.chaos_attack_rate"));
      break;
    }
    case "money": {
      rateConfig = getRandomConfigByRandomStack(config.get("worldboss.money_attack_rate"));
      break;
    }
    case "moneyChaos": {
      rateConfig = getRandomConfigByRandomStack(config.get("worldboss.money_chaos_attack_rate"));
      break;
    }
    default:
      break;
  }

  if (id == 191) {
    DefaultLogger.info("特別處理");
    rateConfig = { min: 0, max: 150 };
  } else if (rateConfig.min < 100 && attackType === "moneyChaos") {
    rateConfig = { min: 100, max: 600 };
  }

  const { min, max } = rateConfig;
  let bonus = Math.floor(Math.random() * (max - min + 1)) + min;
  DefaultLogger.info(`${attackType} bonus ${bonus} original damage ${damage}`);
  damage = (damage * bonus) / 100;
  DefaultLogger.info(`${attackType} bonus ${bonus} final damage ${damage}`);

  return Math.round(damage);
}

/**
 * 透過隨機堆疊取得隨機值
 * @param {Array<{min: Number, max: Number, rate: Number}>} randomStack
 * @returns {Object<{min: Number, max: Number, rate: Number}>}
 */
function getRandomConfigByRandomStack(randomStack) {
  let randomNumber = Math.floor(Math.random() * 1000);
  let rateStackCount = 0;
  let target = randomStack.find(item => {
    rateStackCount += item.rate * 1000;
    return randomNumber <= rateStackCount;
  });

  return target || { min: 100, max: 100 };
}

/**
 * 取得傷害基礎值
 * @param {Number} level 等級
 * @returns {Number} 基礎傷害
 */
function getStandardDamage(level = 1) {
  return Math.floor(Math.pow(level, 2)) + level * 10;
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
