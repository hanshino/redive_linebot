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

  context.sendText(
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
  // context.sendText(`感謝加我好友，先為您提供以下功能`);
  // welcome(context);
}

async function HandleJoin(context) {
  if (context.event.source.type === "room") {
    welcome(context);
    return;
  }

  context.sendText(
    "感謝將在下加入群組，在下會全力以赴地輔佐各位\n主人可以問在下:\n\n角色名稱(暱稱)+專武/技能/裝備\n競技幣 公主競技幣\n戰隊幣 地城幣 大師幣\n女神石兌換 活動兌換 支線劇情\n困難掉落 活動排程\n專武開放 專武需求\n實用連結 聖跡調查\n卡池 站位 RANK UB\n狀態圖示 解放演出(美術圖+CV)\n回報\n"
  );
}

function HandleUnfollow(context) {
  // 進行自訂指令刪除
  CustomerOrderModel.orderShutdown(context.event.source.userId);
}

function HandleLeave(context) {
  // 進行自訂指令刪除
  CustomerOrderModel.orderShutdown(context.event.source.groupId || context.event.source.roomId);
}
