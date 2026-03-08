const mysql = require("../../util/mysql");
const TABLE = "janken_records";
const { pick, get } = require("lodash");

const fillable = [
  "id",
  "user_id",
  "target_user_id",
  "group_id",
  "bet_amount",
  "bet_fee",
  "p1_choice",
  "p2_choice",
  "elo_change",
  "streak_broken",
  "bounty_won",
];

exports.find = async id => {
  return await mysql(TABLE).where({ id }).first();
};

exports.searchLatest = async (options = {}) => {
  let { userId, targetUserId } = get(options, "filter", {});
  let query = mysql(TABLE);
  if (userId) query = query.where({ user_id: userId });
  if (targetUserId) query = query.where({ target_user_id: targetUserId });

  return await query.orderBy("created_at", "desc").first();
};

exports.findByUserId = async userId => {
  return await mysql(TABLE).where({ user_id: userId }).first();
};

exports.findByTargetUserId = async targetUserId => {
  return await mysql(TABLE).where({ target_user_id: targetUserId }).first();
};

exports.create = async (attributes = {}) => {
  let data = pick(attributes, fillable);
  return await mysql(TABLE).insert(data);
};

exports.update = async (id, attributes = {}) => {
  let data = pick(attributes, fillable);
  return await mysql(TABLE).update(data).where({ id });
};

exports.getRecentMatches = async (limit = 20) => {
  return await mysql(TABLE)
    .select(
      `${TABLE}.id`,
      `${TABLE}.user_id as p1_user_id`,
      `${TABLE}.target_user_id as p2_user_id`,
      `${TABLE}.p1_choice`,
      `${TABLE}.p2_choice`,
      `${TABLE}.bet_amount`,
      `${TABLE}.elo_change`,
      `${TABLE}.streak_broken`,
      `${TABLE}.bounty_won`,
      `${TABLE}.created_at`,
      "r1.result as p1_result",
      "r2.result as p2_result",
      "u1.display_name as p1_display_name",
      "u2.display_name as p2_display_name"
    )
    .join("janken_result as r1", function () {
      this.on("r1.record_id", "=", `${TABLE}.id`).andOn("r1.user_id", "=", `${TABLE}.user_id`);
    })
    .join("janken_result as r2", function () {
      this.on("r2.record_id", "=", `${TABLE}.id`).andOn(
        "r2.user_id",
        "=",
        `${TABLE}.target_user_id`
      );
    })
    .join("User as u1", function () {
      this.on(
        mysql.raw("`u1`.`platformId` COLLATE utf8mb4_0900_ai_ci = `janken_records`.`user_id`")
      );
    })
    .join("User as u2", function () {
      this.on(
        mysql.raw(
          "`u2`.`platformId` COLLATE utf8mb4_0900_ai_ci = `janken_records`.`target_user_id`"
        )
      );
    })
    .whereNotNull(`${TABLE}.p1_choice`)
    .orderBy(`${TABLE}.created_at`, "desc")
    .limit(limit);
};
