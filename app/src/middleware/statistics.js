const { get } = require("lodash");
const { io } = require("../util/connection");
const redis = require("../util/redis");
const AchievementEngine = require("../service/AchievementEngine");
const { notifyUnlocks } = require("../service/achievementNotifier");
const MessageIO = io.of("/admin/messages");

const COMMAND_PREFIX_RE = /^[/#.]\p{L}/u;

/**
 * 數據紀錄
 * @param {Context} context
 * @param {Object} props
 */
const statistics = async (context, props) => {
  eventFire(context);
  await eventEnqueue(context);

  if (context.event.isText) {
    const userId = context.event.source.userId;
    const groupId = context.event.source.groupId;
    if (userId) {
      const mentionees = get(context, "event.message.mention.mentionees", []);
      const mentionedUserIds = mentionees.map(m => m && m.userId).filter(Boolean);
      const text = context.event.text || "";

      const unlocksByUser = { [userId]: [] };
      const evaluations = [
        AchievementEngine.evaluate(userId, "chat_message", { groupId, text, feature: "chat" })
          .then(r => unlocksByUser[userId].push(...((r && r.unlocked) || [])))
          .catch(() => {}),
      ];
      if (COMMAND_PREFIX_RE.test(text)) {
        evaluations.push(
          AchievementEngine.evaluate(userId, "command_use", {})
            .then(r => unlocksByUser[userId].push(...((r && r.unlocked) || [])))
            .catch(() => {})
        );
      }
      if (mentionedUserIds.length) {
        evaluations.push(
          AchievementEngine.evaluate(userId, "mention_keyword", {
            mentionedUserIds,
            text,
          })
            .then(r => unlocksByUser[userId].push(...((r && r.unlocked) || [])))
            .catch(() => {})
        );
        for (const mentioneeId of mentionedUserIds) {
          unlocksByUser[mentioneeId] = unlocksByUser[mentioneeId] || [];
          evaluations.push(
            AchievementEngine.evaluate(mentioneeId, "received_mention", {
              mentionedByUserId: userId,
              text,
              groupId,
            })
              .then(r => unlocksByUser[mentioneeId].push(...((r && r.unlocked) || [])))
              .catch(() => {})
          );
        }
      }

      await Promise.all(evaluations);
      for (const [uid, unlocked] of Object.entries(unlocksByUser)) {
        if (unlocked.length) await notifyUnlocks(context, uid, unlocked);
      }
    }
  }

  return props.next;
};

module.exports = statistics;

async function eventEnqueue(context) {
  return await redis.lPush("ChatBotEvent", JSON.stringify(context.event.rawEvent), 86400);
}

function eventFire(context) {
  const event = context.event._rawEvent;

  if (event.source.type === "group") {
    event.source = {
      ...event.source,
      ...context.state.groupDatas,
    };

    event.source.groupUrl = context.state.groupDatas.pictureUrl;
  }

  event.source = {
    ...event.source,
    ...context.state.userDatas[event.source.userId],
  };

  MessageIO.emit("newEvent", event);
}
