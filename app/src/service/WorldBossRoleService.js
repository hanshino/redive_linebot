const config = require("config");
const mysql = require("../util/mysql");
const WorldBossRole = require("../model/application/WorldBossRole");
const WorldBossBaseGearSeeder = require("../../seeds/WorldBossBaseGearSeeder");
const EquipmentService = require("./EquipmentService");
const { inventory } = require("../model/application/Inventory");
const { DefaultLogger } = require("../util/Logger");

const VALID_ROLES = ["dps", "healer", "tank"];
const DEFAULT_ROLE = "dps";
const ALREADY_OWNED = "已擁有此裝備";

function assertValidRole(role) {
  if (!VALID_ROLES.includes(role)) {
    throw new Error("無效的職業");
  }
}

// Lazy default (D27): legacy players have no row and read as dps.
async function getRole(platformId) {
  const row = await WorldBossRole.find(platformId);
  return row ? row.role : DEFAULT_ROLE;
}

// Grant the +0 base gear set and auto-equip each granted piece so role stats
// (atk_percent / support_power / block_power) are active without a manual #裝備.
// EquipmentService.equip also invalidates the playerEquipment redis cache (addendum §3).
// "Already owned" is an idempotent skip; other errors propagate.
async function grantBaseGear(platformId, role) {
  const ids = await WorldBossBaseGearSeeder.getRoleGearIds(mysql, role);
  const granted = [];
  for (const equipmentId of ids) {
    try {
      await EquipmentService.addToInventory(platformId, equipmentId);
    } catch (err) {
      if (err && err.message === ALREADY_OWNED) {
        DefaultLogger.debug(
          `[WorldBossRoleService] ${platformId} already owns gear ${equipmentId}, skip`
        );
        continue;
      }
      throw err;
    }
    // Auto-equip only freshly granted pieces (already-owned ones may be equipped elsewhere).
    await EquipmentService.equip(platformId, equipmentId);
    granted.push(equipmentId);
  }
  return granted;
}

async function chooseRole(platformId, role) {
  assertValidRole(role);
  const existing = await WorldBossRole.find(platformId);
  // If a row already exists, this is a re-pick, not a first choose.
  if (existing) {
    const result = await reselectRole(platformId, role);
    return { role: result.role, granted_gear: [] };
  }
  await WorldBossRole.create({ user_id: platformId, role, reselect_count: 0 });
  const granted = await grantBaseGear(platformId, role);
  return { role, granted_gear: granted };
}

async function reselectRole(platformId, role) {
  assertValidRole(role);
  const existing = await WorldBossRole.find(platformId);
  if (!existing) {
    throw new Error("尚未選擇職業");
  }

  const free = existing.reselect_count === 0;
  const nextCount = existing.reselect_count + 1;

  if (free) {
    // Free path (D27 one-free-reselect): a single update, no money movement, no transaction.
    await WorldBossRole.update(platformId, { role, reselect_count: nextCount });
    return { role, free_used: true };
  }

  // Paid path: affordability check first, then debit + update atomically so a failed
  // update never leaves the player charged. decreaseGodStone writes a NEGATIVE ledger row.
  const cost = config.get("worldboss.reselect_stone_cost");
  const { amount } = await inventory.getUserMoney(platformId);
  if ((amount || 0) < cost) {
    throw new Error("女神石不足");
  }

  await mysql.transaction(async trx => {
    await inventory.decreaseGodStone({
      userId: platformId,
      amount: cost,
      note: "world_boss_role_reselect",
      trx,
    });
    await WorldBossRole.update(platformId, { role, reselect_count: nextCount }, { trx });
  });

  return { role, free_used: false };
}

exports.VALID_ROLES = VALID_ROLES;
exports.getRole = getRole;
exports.chooseRole = chooseRole;
exports.reselectRole = reselectRole;
