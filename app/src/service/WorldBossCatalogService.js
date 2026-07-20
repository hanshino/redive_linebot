const WorldBoss = require("../model/application/WorldBoss");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function normalizeBossInput(input = {}) {
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

async function deleteBoss(id, trx) {
  if (await WorldBoss.isInUse(id, trx)) throw fail("BOSS_IN_USE");
  return WorldBoss.model.delete(id, trx);
}

module.exports = {
  normalizeBossInput,
  listBosses,
  createBoss,
  updateBoss,
  deleteBoss,
};
