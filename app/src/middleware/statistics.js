const { io } = require("../util/connection");
const MessageService = require("../util/MessageService");
const MessageIO = io.of("/Admin/Messages");

/**
 * 數據紀錄
 * @param {Context} context
 * @param {Object} props
 */
const statistics = async (context, props) => {
  await eventEnqueue(context);
  return props.next;
};

module.exports = statistics;

async function eventEnqueue(context) {
  await MessageService.connect();
  let eventQueue = await MessageService.getQueue("ChatBotEvent", 86400000);
  eventQueue.enqueue(JSON.stringify(context.event.rawEvent));
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
