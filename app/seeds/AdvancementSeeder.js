exports.seed = function (knex) {
  // Deletes ALL existing entries
  return knex("advancement")
    .del()
    .then(function () {
      // Inserts seed entries
      return knex("advancement").insert([
        {
          name: "janken_king",
          type: "janken",
          description: "位於猜拳食物鏈的頂端...雖然沒有每次獲勝，卻不氣餒不斷攀爬至此處。",
          icon: "👊",
          order: 1,
        },
        {
          name: "janken_winner",
          type: "janken",
          description: "賦予最多猜拳勝利的玩家。",
          icon: "✌️",
          order: 3,
        },
        {
          name: "janken_loser",
          type: "janken",
          description: "猜拳只要每次都輸，代表著你的智商不夠，你只能被拍賣了。",
          icon: "🤞",
          order: 3,
        },
        {
          name: "janken_drawer",
          type: "janken",
          description: "和局高手，你的猜拳技巧超乎你的想像。",
          icon: "🤞",
          order: 3,
        },
        {
          name: "system_manager",
          type: "system",
          description: "系統管理員，擁有最高權限。",
          icon: "🐲",
          order: 0,
        },
        {
          name: "chat_king",
          type: "chat",
          description: "聊天室第一名，擁有話語霸權。",
          icon: "🤖",
          order: 1,
        },
        {
          name: "chat_king_2",
          type: "chat",
          description: "聊天室第二名，擁有話語霸權。",
          icon: "🤖",
          order: 2,
        },
        {
          name: "chat_king_3",
          type: "chat",
          description: "聊天室第三名，擁有話語霸權。",
          icon: "🤖",
          order: 3,
        },
        {
          name: "gacha_king",
          type: "gacha",
          description: "轉蛋蒐集王，擁有最多老婆的辣個人。",
          icon: "🎉",
          order: 1,
        },
        {
          name: "gacha_king_2",
          type: "gacha",
          description: "轉蛋蒐集王第二名",
          icon: "🎉",
          order: 2,
        },
        {
          name: "gacha_king_3",
          type: "gacha",
          description: "轉蛋蒐集王第三名",
          icon: "🎉",
          order: 3,
        },
        {
          name: "gacha_rich",
          type: "gacha",
          description: "擁有最多女神石的有錢人，布丁首富。",
          icon: "💰",
          order: 1,
        },
        {
          name: "gacha_rich_2",
          type: "gacha",
          description: "擁有女神石的有錢人第二名。",
          icon: "💰",
          order: 2,
        },
        {
          name: "gacha_rich_3",
          type: "gacha",
          description: "擁有女神石的有錢人第三名。",
          icon: "💰",
          order: 3,
        },
        {
          name: "progressors",
          type: "world_boss",
          description: "攻略組，授予前 1% 玩家",
          icon: "🗡",
          order: 4,
        },
        {
          name: "leechers",
          type: "world_boss",
          description: "躺分組，授予後 1% 玩家",
          icon: "🪱",
          order: 9,
        },
      ]);
    });
};
