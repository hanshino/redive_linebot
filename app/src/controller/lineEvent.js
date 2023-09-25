const { router, route, line } = require("bottender/router");
const CustomerOrderModel = require("../model/application/CustomerOrder");
const GuildConfigModel = require("../model/application/GuildConfig");
const welcome = require("../templates/common/welcome");
const lineAPI = require("../util/line");
const { assemble } = require("../templates/common");
const { getClient } = require("bottender");
const LineClient = getClient("line");

module.exports = (context, props) => {
  return router([
    line.follow(HandleFollow),
    line.unfollow(HandleUnfollow),
    line.join(HandleJoin),
    line.leave(HandleLeave),
    line.memberJoined(HandleMemberJoined),
    line.memberLeft(HandleMemberLeft),
    route("*", props.next),
  ]);
};

async function HandleMemberJoined(context) {
  const { type, groupId } = context.event.source;
  const { userId } = context.event._rawEvent.joined.members[0];
  if (type !== "group") return;

  const WelcomeMessage = await GuildConfigModel.getWelcomeMessage(groupId);
  if (WelcomeMessage === "") return;

  const { displayName } = await LineClient.getGroupMemberProfile(groupId, userId);
  const { groupName } = await lineAPI.getGroupSummary(groupId);

  context.quoteReply(
    assemble(
      {
        username: displayName,
        groupname: groupName,
      },
      WelcomeMessage
    )
  );
}

function HandleMemberLeft() {
  // nothing to do
}

function HandleFollow(context) {
  context.quoteReply(`感謝加我好友，先為您提供以下功能`);
  welcome(context);
}

async function HandleJoin(context) {
  if (context.event.source.type === "room") {
    welcome(context);
    return;
  }

  context.quoteReply("感謝邀請我至群組，群組初始化開始...");

  const [summary, countData] = await Promise.all([
    lineAPI.getGroupSummary(context.event.source.groupId),
    lineAPI.getGroupCount(context.event.source.groupId),
  ]);

  context.quoteReply(
    `已設置好群組資訊：\n群組名稱：${summary.groupName}\n群組人數：${countData.count}`
  );

  context.quoteReply("如需觀看使用說明，請輸入：#使用說明");
}

function HandleUnfollow(context) {
  // 進行自訂指令刪除
  CustomerOrderModel.orderShutdown(context.event.source.userId);
}

function HandleLeave(context) {
  // 進行自訂指令刪除
  CustomerOrderModel.orderShutdown(context.event.source.groupId || context.event.source.roomId);
}
