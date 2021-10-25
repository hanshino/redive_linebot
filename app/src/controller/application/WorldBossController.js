// eslint-disable-next-line no-unused-vars
const { Context, getClient } = require("bottender");
const { text } = require("bottender/router");
const adminModel = require("../../model/application/Admin");
const ChatLevelModel = require("../../model/application/ChatLevelModel");
const worldBossModel = require("../../model/application/WorldBoss");
const worldBossEventService = require("../../service/WorldBossEventService");
const worldBossEventLogService = require("../../service/WorldBossEventLogService");
const worldBossUserAttackMessageService = require("../../service/WorldBossUserAttackMessageService");
const worldBossTemplate = require("../../templates/application/WorldBoss");
const redis = require("../../util/redis");
const i18n = require("../../util/i18n");
const { DefaultLogger } = require("../../util/Logger");
const LineClient = getClient("line");
const opencvModel = require("../../model/application/OpencvModel");
const characters = require("../../../doc/characterInfo.json");

exports.router = [
  text("/bosslist", bosslist),
  text("/worldboss", bossEvent),
  text("/allevent", all),
  text("/worldrank", worldRank),
  text("/worldattacktemplate", worldAttackTemplate),
  text(/^\/(sa|systemattack)(\s(?<percentage>\d{1,2}))?$/, adminAttack),
];

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

  // context.replyText(JSON.stringify(rankBubble));
  context.replyFlex(`${data.name} 的戰鬥模板`, {
    type: "carousel",
    contents: [mainBubble, infoBubble, rankBubble],
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
  const { level } = await ChatLevelModel.getUserData(userId);

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
  let pictureUrl = characters.find(data => data.unitId == templateData.unit_id).HeadImage;

  let message = `${i18n.__(templateData.template, {
    name,
    damage,
  })}，${i18n.__n("message.damage_suffix", damage)}`;
  let sender = { name: displayName.substr(0, 20), iconUrl: pictureUrl };

  DefaultLogger.info(`${message} ${JSON.stringify(sender)}`);

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
  // 根據等級計算攻擊力，等級越高，攻擊力越大，使用等級的平方
  const damage = (level * 0.1 + Math.floor(Math.random() * level) * 0.5 + 1) * 10;
  return Math.round(damage);
}
