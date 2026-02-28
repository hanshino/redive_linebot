const { io } = require("../util/connection");
const redis = require("../util/redis");
const MessageIO = io.of("/admin/messages");

/**
 * 數據紀錄
 * @param {Context} context
 * @param {Object} props
 */
const statistics = async (context, props) => {
  eventFire(context);
  await eventEnqueue(context);
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
