// eslint-disable-next-line no-unused-vars
const { Context } = require("bottender");
const { text } = require("bottender/router");
const worldBossModel = require("../../model/application/WorldBoss");
const worldBossEventService = require("../../service/WorldBossEventService");
const worldBossEventLogService = require("../../service/WorldBossEventLogService");
const worldBossTemplate = require("../../templates/application/WorldBoss");
const i18n = require("../../util/i18n");

exports.router = [text("/bosslist", bosslist), text("/eventlist", bosslistEvent)];

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
async function bosslistEvent(context) {
  const data = await worldBossEventService.getEventBoss(1);
  let { total_damage: totalDamage = 0 } = await worldBossEventLogService.getRemainHpByEventId(
    data.id
  );
  const infoBubble = worldBossTemplate.generateBossInformation(data);
  const mainBubble = worldBossTemplate.generateBoss({
    ...data,
    fullHp: data.hp,
    currentHp: data.hp - parseInt(totalDamage),
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
  const { displayName, pictureUrl, id } = context.event.source;

  // 沒有會員id，跳過不處理
  if (!id) {
    return;
  }

  const eventBoss = await worldBossEventService.getBossInformation(worldBossEventId);
  const { name } = eventBoss;
  let { total_damage: totalDamage = 0 } = await worldBossEventLogService.getRemainHpByEventId(
    worldBossEventId
  );

  // 如果此王已經死亡，則不處理
  if (eventBoss.hp - parseInt(totalDamage) <= 0) {
    return;
  }

  // 新增對 boss 攻擊紀錄
  let attributes = {
    user_id: id,
    world_boss_event_id: worldBossEventId,
    action_type: "normal",
    damage: 1,
  };
  await worldBossEventLogService.create(attributes);

  context.replyText(i18n.__("message.user_attack_on_world_boss", { name, damage: 1 }), {
    sender: { name: displayName, iconUrl: pictureUrl },
  });
};
