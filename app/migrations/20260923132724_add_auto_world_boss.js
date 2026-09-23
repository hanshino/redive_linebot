// 世界王自動攻擊（Plus 專屬 candidate perk）。見
// docs/plans/2026-09-09-sponsorship-subscription-roadmap.md §5「2026-09-23 Plus 世界王自動攻擊」。
//
// (a) user_auto_preference 新增 auto_world_boss（總開關，預設 1 = 開，比照
//     AutoPreferenceController 的「未建列/舊列視為開啟」規則——這裡直接把欄位預設值
//     設成 1，讓既有列與新建列在沒有明確填值時行為一致，不需要應用層另外補一層預設）
//     與 auto_world_boss_mode（standard/skill，預設 standard）。
// (b) 冪等把 {type:"auto_world_boss", value:1} 補進 subscribe_card.effects（key='month_plus'）；
//     已存在就跳過。比照 20260418090334_seed_subscribe_card_auto_effects.js 的正規化/冪等寫法。
const NEW_EFFECT_TYPE = "auto_world_boss";
const TARGET_CARD_KEY = "month_plus";

function normalizeEffects(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  await knex.schema.alterTable("user_auto_preference", table => {
    table
      .boolean("auto_world_boss")
      .notNullable()
      .defaultTo(true)
      .comment("世界王自動攻擊總開關（預設開啟：無列或舊列一律視為已啟用）");
    table
      .string("auto_world_boss_mode", 16)
      .notNullable()
      .defaultTo("standard")
      .comment("自動攻擊方式：standard 普通攻擊 / skill 技能攻擊（額度不足時降級為 standard）");
  });

  const card = await knex("subscribe_card").where({ key: TARGET_CARD_KEY }).first();
  if (!card) return;

  const effects = normalizeEffects(card.effects);
  const existingTypes = new Set(effects.map(e => e && e.type).filter(Boolean));
  if (!existingTypes.has(NEW_EFFECT_TYPE)) {
    effects.push({ type: NEW_EFFECT_TYPE, value: 1 });
    await knex("subscribe_card")
      .where({ key: TARGET_CARD_KEY })
      .update({ effects: JSON.stringify(effects) });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const card = await knex("subscribe_card").where({ key: TARGET_CARD_KEY }).first();
  if (card) {
    const effects = normalizeEffects(card.effects);
    const filtered = effects.filter(e => !(e && e.type === NEW_EFFECT_TYPE));
    if (filtered.length !== effects.length) {
      await knex("subscribe_card")
        .where({ key: TARGET_CARD_KEY })
        .update({ effects: JSON.stringify(filtered) });
    }
  }

  await knex.schema.alterTable("user_auto_preference", table => {
    table.dropColumn("auto_world_boss");
    table.dropColumn("auto_world_boss_mode");
  });
};
