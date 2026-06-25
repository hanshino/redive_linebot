// Controller for the chat word-cloud feature (M5): the in-chat LINE commands.
//
//   /我的文字雲 [7]  個人排行條（預設 30 天，給 7 切近 7 天）
//   /群組話題  [7]   群組聚合排行條（限群組使用）
//
// Reads topic_daily via service/topic/query and replies a 排行條 giga bubble
// (templates/application/TopicCloud). See the concept doc's 對外體驗 section.

const { text } = require("bottender/router");
const { get } = require("lodash");
const query = require("../../service/topic/query");
const TopicCloudTemplate = require("../../templates/application/TopicCloud");

const DEFAULT_DAYS = 30;
const SHORT_DAYS = 7;

// 群組話題 is group-only, enforced inside showGroupTopics (so a 1:1 chat still
// gets a helpful reply), hence it lives in the same router rather than a
// separately type-gated one.
exports.router = [
  text(/^[/#.]我的文字雲(\s*(?<days>\d+))?$/, showMyWordCloud),
  text(/^[/#.]群組話題(\s*(?<days>\d+))?$/, showGroupTopics),
];

// "7" -> 7 天，其餘（含未填）-> 30 天。
function resolveDays(props) {
  const raw = get(props, "match.groups.days");
  return Number(raw) === SHORT_DAYS ? SHORT_DAYS : DEFAULT_DAYS;
}

function periodLabel(days) {
  return `近 ${days} 天`;
}

/**
 * /我的文字雲：個人近 N 天高頻用字。群組內查只看本群；私聊則跨群聚合。
 * @param {import("bottender").LineContext} context
 */
async function showMyWordCloud(context, props) {
  const { userId, type } = context.event.source;
  const days = resolveDays(props);
  const groupId = type === "group" ? context.event.source.groupId : null;

  const rows = await query.topUserKeywords(userId, { groupId, days });

  if (rows.length === 0) {
    return context.replyText(TopicCloudTemplate.generateNoDataText());
  }

  const bubble = TopicCloudTemplate.generateWordCloudFlex({
    rows,
    title: "📊 我的文字雲",
    period: periodLabel(days),
  });
  return context.replyFlex("我的文字雲", bubble);
}

/**
 * /群組話題：群組近 N 天聚合高頻用字（不掛人名）。限群組使用。
 * @param {import("bottender").LineContext} context
 */
async function showGroupTopics(context, props) {
  const { type, groupId } = context.event.source;
  if (type !== "group") {
    return context.replyText("這個指令請在群組裡使用喔～");
  }

  const days = resolveDays(props);
  const rows = await query.topGroupKeywords(groupId, { days });

  if (rows.length === 0) {
    return context.replyText(TopicCloudTemplate.generateNoDataText());
  }

  const bubble = TopicCloudTemplate.generateWordCloudFlex({
    rows,
    title: "📊 群組話題",
    period: periodLabel(days),
  });
  return context.replyFlex("群組話題", bubble);
}

exports._internal = { showMyWordCloud, showGroupTopics, resolveDays };
