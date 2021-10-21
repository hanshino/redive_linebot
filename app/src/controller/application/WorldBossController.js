// eslint-disable-next-line no-unused-vars
const { Context } = require("bottender");
const { text } = require("bottender/router");
const adminModel = require("../../model/application/Admin");
const ChatLevelModel = require("../../model/application/ChatLevelModel");
const worldBossModel = require("../../model/application/WorldBoss");
const worldBossEventService = require("../../service/WorldBossEventService");
const worldBossEventLogService = require("../../service/WorldBossEventLogService");
const worldBossTemplate = require("../../templates/application/WorldBoss");
const redis = require("../../util/redis");
const i18n = require("../../util/i18n");

exports.router = [
  text("/bosslist", bosslist),
  text("/worldboss", bossEvent),
  text("/allevent", all),
  text(/^\/(sa|systemattack)(\s(?<percentage>\d{1,2}))?$/, adminAttack),
];

/**
 * @param {Context} context
 * @param {import("bottender").Props} props
 */
async function adminAttack(context, props) {
  const { percentage } = props.match.groups;
  // 取得正在進行中的世界事件
  const events = await worldBossEventService.getCurrentEvent();

  // 多起世界事件正在舉行中
  if (events.length > 1) {
    context.replyText(i18n.__("message.world_boss_event_multiple_ongoing"));
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
  }

  const data = await worldBossEventService.getEventBoss(events[0].id);
  let { total_damage: totalDamage = 0 } = await worldBossEventLogService.getRemainHpByEventId(
    data.id
  );
  let remainHp = data.hp - parseInt(totalDamage || 0);
  let hasCompleted = remainHp <= 0;
  const infoBubble = worldBossTemplate.generateBossInformation({ ...data, hasCompleted });
  const mainBubble = worldBossTemplate.generateBoss({
    ...data,
    fullHp: data.hp,
    currentHp: remainHp < 0 ? 0 : remainHp,
    hasCompleted,
  });

  context.replyFlex("Boss", { type: "carousel", contents: [mainBubble, infoBubble] });
}

/**
 * @param {Context} context
 * @param {import("bottender").Props} props
 */
exports.attackOnBoss = async (context, props) => {
  const { worldBossEventId } = props.payload;
  // 從事件的 source 取得用戶資料
  const { displayName, pictureUrl, id, userId } = context.event.source;

  // 沒有會員id，跳過不處理
  if (!id) {
    return;
  }

  // 判斷是否可以攻擊
  const canAttack = await isUserCanAttack(userId);
  if (!canAttack && process.env.NODE_ENV === "production") {
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

  context.replyText(
    `${i18n.__("message.user_attack_on_world_boss", {
      name,
      damage,
    })}，${i18n.__n("message.damage_suffix", damage)}`,
    {
      sender: { name: displayName, iconUrl: pictureUrl },
    }
  );
};

/**
 * 判斷是否可以攻擊
 * @param {String} userId
 * @returns {Boolean}
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
  const damage = level * 0.1 + Math.floor(Math.random() * level) * 0.5 + 1;
  return Math.round(damage);
}
