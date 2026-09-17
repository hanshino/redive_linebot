const mysql = require("../../util/mysql");
const TABLE = "daily_quest";
const { get } = require("lodash");
const { toUtc8Date } = require("../../util/date");

const asQuestDate = value =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : toUtc8Date(value);

exports.all = async (userId, options = {}) => {
  let query = mysql(TABLE);
  if (userId) query = query.where({ user_id: userId });

  let [questStartAt, questEndAt] = [
    get(options, "filter.questDate.start", get(options, "filter.createdAt.start")),
    get(options, "filter.questDate.end", get(options, "filter.createdAt.end")),
  ];

  if (questStartAt) {
    query = query.whereRaw("COALESCE(quest_date, DATE(created_at)) >= ?", [
      asQuestDate(questStartAt),
    ]);
  }
  if (questEndAt) {
    query = query.whereRaw("COALESCE(quest_date, DATE(created_at)) <= ?", [
      asQuestDate(questEndAt),
    ]);
  }

  return await query.select("*");
};
