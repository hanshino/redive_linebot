const WorldBoss = require("../model/application/WorldBoss");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function normalizeBossInput(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw fail("INVALID_BOSS_NAME");

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 64) throw fail("INVALID_BOSS_NAME");

  const hpWeight = Number(input.hp_weight);
  if (!Number.isFinite(hpWeight) || hpWeight <= 0) throw fail("INVALID_HP_WEIGHT");

  return {
    name,
    hp_weight: hpWeight,
    image: input.image ?? null,
    description: input.description ?? null,
  };
}

async function listBosses() {
  return WorldBoss.list();
}

async function createBoss(input, trx) {
  return WorldBoss.model.create(normalizeBossInput(input), trx);
}

async function updateBoss(id, input, trx) {
  return WorldBoss.model.update(id, normalizeBossInput(input), {}, trx);
}

function isBossRoundReferenceError(error) {
  return (
    (error.code === "ER_ROW_IS_REFERENCED_2" || error.errno === 1451) &&
    error.sqlMessage?.includes("`fk_wbr_world_boss`") &&
    error.sqlMessage.includes("`world_boss_round`")
  );
}

async function deleteBoss(id, trx) {
  try {
    return await WorldBoss.model.delete(id, trx);
  } catch (error) {
    if (isBossRoundReferenceError(error)) throw fail("BOSS_IN_USE");
    throw error;
  }
}

module.exports = {
  normalizeBossInput,
  listBosses,
  createBoss,
  updateBoss,
  deleteBoss,
};
