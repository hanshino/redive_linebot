/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = function (knex) {
  // Deletes ALL existing entries
  return knex("tips_message")
    .del()
    .then(function () {
      // Inserts seed entries
      return knex("tips_message").insert([
        { message: "只有每天第一次使用 #抽 的時候才會進入 #我的包包" },
        { message: "在每日一抽蒐集到的女神石，可以使用 #轉蛋商店 兌換特別的角色" },
        { message: "女神石還可以用在 #消耗抽 ，此指令會讓你每日一抽的三星機率加倍" },
        { message: "在群組中聊天，可以獲得說話經驗，可以使用 /me 來查看經驗進度" },
        { message: "苦於決定事情嗎？使用 #決鬥 跟好友猜拳，讓對方決定吧～" },
        { message: "每日任務解完可以獲得 150顆的女神石" },
      ]);
    });
};
