const NEW_EFFECT_TYPES = ["auto_daily_gacha", "auto_janken_fate"];
const TARGET_CARD_KEYS = ["month", "season"];

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
  for (const key of TARGET_CARD_KEYS) {
    const card = await knex("subscribe_card").where({ key }).first();
    if (!card) continue;

    const effects = normalizeEffects(card.effects);
    const existingTypes = new Set(effects.map(e => e && e.type).filter(Boolean));
    let changed = false;

    for (const type of NEW_EFFECT_TYPES) {
      if (!existingTypes.has(type)) {
        effects.push({ type, value: 1 });
        changed = true;
      }
    }

    if (changed) {
      await knex("subscribe_card")
        .where({ key })
        .update({ effects: JSON.stringify(effects) });
    }
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  for (const key of TARGET_CARD_KEYS) {
    const card = await knex("subscribe_card").where({ key }).first();
    if (!card) continue;

    const effects = normalizeEffects(card.effects);
    const filtered = effects.filter(e => !(e && NEW_EFFECT_TYPES.includes(e.type)));

    if (filtered.length !== effects.length) {
      await knex("subscribe_card")
        .where({ key })
        .update({ effects: JSON.stringify(filtered) });
    }
  }
};
