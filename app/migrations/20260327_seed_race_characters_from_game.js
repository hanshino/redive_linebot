const path = require("path");
const betterSqlite3 = require("better-sqlite3");

const AVATAR_BASE = "https://chieru.hanshino.dev/assets/units/head";

exports.up = async function (knex) {
  const dbPath = path.resolve(__dirname, "../assets/redive_tw.db");
  const sqlite = betterSqlite3(dbPath, { readonly: true });

  // All playable characters from unit_profile
  const profiles = sqlite
    .prepare("SELECT unit_id, unit_name FROM unit_profile WHERE unit_id >= 100000 AND unit_id < 200000 ORDER BY unit_id")
    .all();

  // Max rarity per unit (6-star uses +60, otherwise +30)
  const rarities = sqlite
    .prepare("SELECT unit_id, MAX(rarity) as max_rarity FROM unit_rarity WHERE unit_id >= 100000 AND unit_id < 200000 GROUP BY unit_id")
    .all();
  const rarityMap = {};
  rarities.forEach(r => { rarityMap[r.unit_id] = r.max_rarity; });

  sqlite.close();

  const characters = profiles.map(p => {
    const suffix = (rarityMap[p.unit_id] || 3) >= 6 ? 60 : 30;
    return {
      name: p.unit_name,
      avatar_url: `${AVATAR_BASE}/${p.unit_id + suffix}.png`,
    };
  });

  // Clear old data (respect foreign key order)
  await knex("race_event").del();
  await knex("race_bet").del();
  await knex("race_runner").del();
  await knex("race").del();
  await knex("race_character").del();
  // Insert in batches of 50 to avoid MySQL packet limits
  const batchSize = 50;
  for (let i = 0; i < characters.length; i += batchSize) {
    await knex("race_character").insert(characters.slice(i, i + batchSize));
  }
};

exports.down = async function (knex) {
  await knex("race_character").del();
};
