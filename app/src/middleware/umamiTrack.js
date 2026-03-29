const umami = require("../util/umami");

/**
 * 指令 mapping 表
 * 順序很重要：更精確的 pattern 要放前面
 */
const commandMap = [
  // === princess ===
  { pattern: /^[/#.]消耗抽/, name: "gacha_pickup", category: "princess" },
  { pattern: /^[/#.]歐洲抽/, name: "gacha_europe", category: "princess" },
  { pattern: /^[/#.]保證抽/, name: "gacha_ensure", category: "princess" },
  { pattern: /^[/#.]抽/, name: "gacha_play", category: "princess" },
  { pattern: /^[#.]我的包包$|^\/mybag$/i, name: "gacha_bag", category: "princess" },
  { pattern: /^[#.](三刀出完|出完三刀|done)$/, name: "battle_done", category: "princess" },
  { pattern: /^[#.](三刀重置|重置三刀|reset)$/, name: "battle_reset", category: "princess" },
  { pattern: /^[#.](出完沒|趕快出|gblist)/, name: "battle_list", category: "princess" },
  { pattern: /^[#.]刀軸轉換$|^[./]bt$/i, name: "battle_time", category: "princess" },
  { pattern: /^[!#/]升滿星/, name: "character_full_rankup", category: "princess" },
  { pattern: /^[!#/]升星/, name: "character_rankup", category: "princess" },
  { pattern: /^[.#]轉蛋(兌換|商店)/, name: "godstone_shop", category: "princess" },

  // === application: level & status ===
  { pattern: /^(#我的狀態|\/me)$/, name: "level_status", category: "application" },
  { pattern: /^[.#/](你的狀態|you)/, name: "level_friend_status", category: "application" },
  { pattern: /^#狀態\s/, name: "level_friend_search", category: "application" },
  { pattern: /^#等級排行$/, name: "level_rank", category: "application" },

  // === application: orders ===
  { pattern: /^[#.]?(指令列表|orderlist)$/, name: "order_list", category: "application" },
  { pattern: /^[#.]?新增關鍵字指令/, name: "order_create_keyword", category: "application" },
  { pattern: /^[#.]?新增指令/, name: "order_create", category: "application" },
  { pattern: /^[#.]?[移刪]除指令/, name: "order_delete", category: "application" },

  // === application: group ===
  {
    pattern: /^[#.]?(群組(設定|狀態|管理)|groupconfig)$/i,
    name: "group_config",
    category: "application",
  },
  { pattern: /^[#./]group$/, name: "group_panel", category: "application" },
  { pattern: /^[.#]自訂頭像/, name: "set_sender", category: "application" },

  // === application: world boss ===
  { pattern: /^#冒險小卡$/, name: "worldboss_status", category: "application" },
  { pattern: /^(\/worldboss|#世界王)$/, name: "worldboss_event", category: "application" },
  { pattern: /^[.#/](攻擊|attack)$/, name: "worldboss_attack", category: "application" },
  { pattern: /^[#]傷害[紀記]錄/, name: "worldboss_logs", category: "application" },
  { pattern: /^[#＃]裝備$/, name: "worldboss_equipment", category: "application" },
  { pattern: /^#夢幻回歸$/, name: "worldboss_revoke", category: "application" },
  { pattern: /^\/worldrank$/, name: "worldboss_rank", category: "application" },

  // === application: janken ===
  { pattern: /^[.#/](猜拳段位|猜拳rank)/, name: "janken_rank", category: "application" },
  {
    pattern: /^[.#/](猜拳(擂台|(大|比)賽)|hold)/,
    name: "janken_challenge",
    category: "application",
  },
  { pattern: /^[.#/](決鬥|duel)/, name: "janken_duel", category: "application" },
  { pattern: /^[.#/](猜拳)/, name: "janken_play", category: "application" },

  // === application: race ===
  { pattern: /^[.#/]賽跑下注\s*\d/, name: "race_bet", category: "application" },
  { pattern: /^[.#/](賽跑紀錄)$/i, name: "race_history", category: "application" },
  { pattern: /^[.#/](賽跑)$/i, name: "race_status", category: "application" },

  // === application: market ===
  { pattern: /^[./#](交易管理|trade-manage)$/i, name: "market_manage", category: "application" },
  { pattern: /^[./#](快速轉帳|fastatm)/i, name: "market_fast_transfer", category: "application" },
  { pattern: /^[./#](轉帳|atm)/i, name: "market_transfer", category: "application" },
  { pattern: /^[./#](交易|trade)/i, name: "market_trade", category: "application" },

  // === application: misc ===
  { pattern: /^[.#/](成就|稱號|adv)$/, name: "advancement", category: "application" },
  { pattern: /^[/.#]兌換\s/, name: "coupon_use", category: "application" },
  { pattern: /^[./#]圖片上傳$/, name: "image_upload", category: "application" },
  {
    pattern: /^[.#/](my[-_]?money|我的錢錢|我的女神石)$/,
    name: "status_godstone",
    category: "application",
  },
  {
    pattern: /^[.#/](my[-_]?character|我的角色|我的角色數量)$/,
    name: "status_character",
    category: "application",
  },
  { pattern: /^[.#/](訂閱兌換|sub-coupon)/, name: "subscribe_coupon", category: "application" },
  { pattern: /^[.#/](訂閱|sub)$/, name: "subscribe_info", category: "application" },
  { pattern: /^[.#/](轉職)$/, name: "job_change", category: "application" },
  { pattern: /^[.#/](我要買月卡)/, name: "subscribe_buy", category: "application" },

  // === general ===
  { pattern: /^[/#.](使用說明|help)$/, name: "help", category: "general" },
  { pattern: /^(\/link|#實用連結|#連結)$/, name: "link", category: "general" },
];

function trackPostback(context) {
  if (!context.event.isPayload) return;

  try {
    const payload = JSON.parse(context.event.payload);
    const { action } = payload;
    if (!action) return;

    umami.track(action, `/bot/postback/${action}`, umami.getSourceData(context));
    // eslint-disable-next-line no-unused-vars
  } catch (e) {
    // payload 不是 JSON，跳過
  }
}

function trackTextCommand(context) {
  if (!context.event.isText) return;

  const text = context.event.message.text;

  for (const cmd of commandMap) {
    if (cmd.pattern.test(text)) {
      umami.track(cmd.name, `/bot/${cmd.category}/${cmd.name}`, umami.getSourceData(context));
      return;
    }
  }
}

const umamiTrack = async (context, props) => {
  trackPostback(context);
  trackTextCommand(context);
  return props.next;
};

module.exports = umamiTrack;
