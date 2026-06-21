// D29 base gear: +0 three-piece starter set per World Boss role.
// dps -> atk_percent (FRACTION); healer -> support_power; tank -> block_power.
// atk_percent is a fraction (0.05 = +5%) to match the live convention
// (WorldBossController applies damage = Math.floor(damage * (1 + atk_percent));
//  getEquipmentBonuses sums the raw stored value — addendum §2).
// support_power / block_power are INTEGER people-counts (addendum §2/§14), not fractions;
// they are inert until M4 teaches getEquipmentBonuses to sum + Math.floor them.
// rarity is "common" — the equipment.rarity enum has no "R" member; any other value fails the
// INSERT (addendum §9). Names are stable sentinels: used as the idempotent insert key AND id lookup key.
const ROLE_GEAR = {
  dps: [
    { name: "[世界王]輸出者之劍", slot: "weapon", attributes: { atk_percent: 0.05 } },
    { name: "[世界王]輸出者之甲", slot: "armor", attributes: { atk_percent: 0.03 } },
    { name: "[世界王]輸出者之飾", slot: "accessory", attributes: { atk_percent: 0.02 } },
  ],
  healer: [
    { name: "[世界王]治療者之杖", slot: "weapon", attributes: { support_power: 1 } },
    { name: "[世界王]治療者之袍", slot: "armor", attributes: { support_power: 1 } },
    { name: "[世界王]治療者之飾", slot: "accessory", attributes: { support_power: 1 } },
  ],
  tank: [
    { name: "[世界王]守護者之盾", slot: "weapon", attributes: { block_power: 1 } },
    { name: "[世界王]守護者之甲", slot: "armor", attributes: { block_power: 1 } },
    { name: "[世界王]守護者之飾", slot: "accessory", attributes: { block_power: 1 } },
  ],
};

function buildRows() {
  const rows = [];
  for (const role of Object.keys(ROLE_GEAR)) {
    for (const piece of ROLE_GEAR[role]) {
      rows.push({
        name: piece.name,
        slot: piece.slot,
        job_id: null,
        rarity: "common",
        attributes: JSON.stringify(piece.attributes),
        description: `世界王${role}基礎裝備`,
        image_url: "",
      });
    }
  }
  return rows;
}

// Idempotent: insert only rows whose sentinel name is not already present.
async function seed(knex) {
  const rows = buildRows();
  const names = rows.map(r => r.name);
  const existing = await knex("equipment").select("name").whereIn("name", names);
  const existingNames = new Set(existing.map(r => r.name));
  const toInsert = rows.filter(r => !existingNames.has(r.name));
  if (toInsert.length > 0) {
    await knex("equipment").insert(toInsert);
  }
}

async function getRoleGearIds(knex, role) {
  const names = ROLE_GEAR[role].map(p => p.name);
  const found = await knex("equipment").select("id").whereIn("name", names);
  return found.map(r => r.id);
}

exports.ROLE_GEAR = ROLE_GEAR;
exports.buildRows = buildRows;
exports.seed = seed;
exports.getRoleGearIds = getRoleGearIds;
