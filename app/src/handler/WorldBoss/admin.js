const CatalogService = require("../../service/WorldBossCatalogService");
const SeasonService = require("../../service/WorldBossSeasonService");
const { toApiDto, respondError, fail, parseId, parseUtcDate } = require(".");

function normalizeName(value, code) {
  if (typeof value !== "string") throw fail(code);
  const name = value.trim();
  if (!name || name.length > 64) throw fail(code);
  return name;
}

function bossPayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw fail("INVALID_BOSS_NAME");
  }
  const hpWeight = Number(input.hp_weight);
  if (!Number.isFinite(hpWeight) || hpWeight <= 0) throw fail("INVALID_HP_WEIGHT");
  return {
    name: normalizeName(input.name, "INVALID_BOSS_NAME"),
    hp_weight: hpWeight,
    image: input.image ?? null,
    description: input.description ?? null,
  };
}

function seasonCreatePayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw fail("INVALID_NAME");
  const endTime = parseUtcDate(input.end_time);
  if (endTime.getTime() <= Date.now()) throw fail("INVALID_END_TIME");
  return {
    name: normalizeName(input.name, "INVALID_NAME"),
    announcement: input.announcement ?? null,
    end_time: endTime,
  };
}

function seasonUpdatePayload(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw fail("INVALID_NAME");
  const payload = {};
  if (Object.prototype.hasOwnProperty.call(input, "name")) {
    payload.name = normalizeName(input.name, "INVALID_NAME");
  }
  if (Object.prototype.hasOwnProperty.call(input, "announcement")) {
    payload.announcement = input.announcement ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "end_time")) {
    payload.end_time = parseUtcDate(input.end_time);
    if (payload.end_time.getTime() <= Date.now()) throw fail("INVALID_END_TIME");
  }
  return payload;
}

exports.listBosses = async function (req, res) {
  try {
    res.json(toApiDto(await CatalogService.listBosses()));
  } catch (error) {
    respondError(res, error);
  }
};

exports.createBoss = async function (req, res) {
  try {
    const id = await CatalogService.createBoss(bossPayload(req.body));
    res.status(201).json({ id });
  } catch (error) {
    respondError(res, error);
  }
};

exports.updateBoss = async function (req, res) {
  try {
    const affected = await CatalogService.updateBoss(parseId(req.params.id), bossPayload(req.body));
    if (!affected) return res.status(404).json({ error: "BOSS_NOT_FOUND" });
    res.json({});
  } catch (error) {
    respondError(res, error);
  }
};

exports.deleteBoss = async function (req, res) {
  try {
    const affected = await CatalogService.deleteBoss(parseId(req.params.id));
    if (!affected) return res.status(404).json({ error: "BOSS_NOT_FOUND" });
    res.json({});
  } catch (error) {
    respondError(res, error);
  }
};

exports.listSeasons = async function (req, res) {
  try {
    res.json(toApiDto(await SeasonService.listSeasons()));
  } catch (error) {
    respondError(res, error);
  }
};

exports.createSeason = async function (req, res) {
  try {
    const id = await SeasonService.createSeason(seasonCreatePayload(req.body));
    res.status(201).json({ id });
  } catch (error) {
    respondError(res, error);
  }
};

exports.updateSeason = async function (req, res) {
  try {
    await SeasonService.updateSeason(parseId(req.params.id), seasonUpdatePayload(req.body));
    res.json({});
  } catch (error) {
    respondError(res, error);
  }
};

exports.deleteSeason = async function (req, res) {
  try {
    await SeasonService.deleteSeason(parseId(req.params.id));
    res.json({});
  } catch (error) {
    respondError(res, error);
  }
};

exports.openSeason = async function (req, res) {
  try {
    res.json(toApiDto(await SeasonService.openSeason(parseId(req.params.id))));
  } catch (error) {
    respondError(res, error);
  }
};
