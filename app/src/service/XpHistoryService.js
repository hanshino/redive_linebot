const ChatExpEvent = require("../model/application/ChatExpEvent");
const ChatExpDaily = require("../model/application/ChatExpDaily");
const UserBlessing = require("../model/application/UserBlessing");
const { resolveTierUppers } = require("./chatXp/diminishTier");
const { todayUtc8, toUtc8Date } = require("../util/date");

function deriveTier(dailyRaw, tier1Upper, tier2Upper) {
  if (dailyRaw < tier1Upper) return 1;
  if (dailyRaw < tier2Upper) return 2;
  return 3;
}

function decimalOrNull(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseModifiers(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function shapeEvent(row) {
  if (!row) return null;
  return {
    id: row.id,
    ts: row.ts,
    group_id: row.group_id,
    raw_exp: Number(row.raw_exp),
    effective_exp: Number(row.effective_exp),
    cooldown_rate: decimalOrNull(row.cooldown_rate),
    group_bonus: decimalOrNull(row.group_bonus),
    base_xp: decimalOrNull(row.base_xp),
    blessing1_mult: decimalOrNull(row.blessing1_mult),
    honeymoon_mult: decimalOrNull(row.honeymoon_mult),
    diminish_factor: decimalOrNull(row.diminish_factor),
    trial_mult: decimalOrNull(row.trial_mult),
    permanent_mult: decimalOrNull(row.permanent_mult),
    modifiers: parseModifiers(row.modifiers),
    weather_protected: Boolean(row.weather_protected),
  };
}

async function buildSummary(userId) {
  const date = todayUtc8();
  const [daily, blessingIds, lastEvent] = await Promise.all([
    ChatExpDaily.findByUserDate(userId, date),
    UserBlessing.listBlessingIdsByUserId(userId),
    ChatExpEvent.findLatestByUser(userId),
  ]);

  const { tier1Upper, tier2Upper } = resolveTierUppers(blessingIds);

  const dailyRaw = daily?.raw_exp ?? 0;
  const today = {
    date,
    raw_exp: dailyRaw,
    effective_exp: daily?.effective_exp ?? 0,
    msg_count: daily?.msg_count ?? 0,
    tier: deriveTier(dailyRaw, tier1Upper, tier2Upper),
    tier1_upper: tier1Upper,
    tier2_upper: tier2Upper,
    honeymoon_active: Boolean(daily?.honeymoon_active),
    active_trial_star: null,
  };

  const last = shapeEvent(lastEvent);
  if (last?.modifiers?.active_trial_star) {
    today.active_trial_star = last.modifiers.active_trial_star;
  }

  return { today, last_event: last };
}

async function buildEvents(userId, { from, to, limit = 1000, beforeId, beforeTs }) {
  const rows = await ChatExpEvent.findInRange({
    userId,
    from,
    to,
    limit,
    beforeId,
    beforeTs,
  });
  return { events: rows.map(shapeEvent) };
}

function shapeDay(row) {
  return {
    date: toUtc8Date(row.date),
    raw_exp: row.raw_exp,
    effective_exp: row.effective_exp,
    msg_count: row.msg_count,
    honeymoon_active: Boolean(row.honeymoon_active),
    trial_id: row.trial_id ?? null,
    weather: row.weather_key
      ? {
          key: row.weather_key,
          name: row.weather_name,
          category: row.weather_category,
          effects: parseModifiers(row.weather_effects),
        }
      : null,
    weather_protected: Boolean(row.protection_id) && row.weather_category === "debuff",
  };
}

async function buildDaily(userId, { from, to }) {
  const rows = await ChatExpDaily.model.knex
    .leftJoin("chat_daily_weather", "chat_exp_daily.date", "chat_daily_weather.date")
    .leftJoin("user_weather_protections", function () {
      this.on("user_weather_protections.weather_date", "=", "chat_exp_daily.date").andOn(
        "user_weather_protections.user_id",
        "=",
        "chat_exp_daily.user_id"
      );
    })
    .where("chat_exp_daily.user_id", userId)
    .andWhere("chat_exp_daily.date", ">=", from)
    .andWhere("chat_exp_daily.date", "<=", to)
    .orderBy("chat_exp_daily.date", "asc")
    .select(
      "chat_exp_daily.date as date",
      "chat_exp_daily.raw_exp as raw_exp",
      "chat_exp_daily.effective_exp as effective_exp",
      "chat_exp_daily.msg_count as msg_count",
      "chat_exp_daily.honeymoon_active as honeymoon_active",
      "chat_exp_daily.trial_id as trial_id",
      "chat_daily_weather.weather_key as weather_key",
      "chat_daily_weather.name as weather_name",
      "chat_daily_weather.category as weather_category",
      "chat_daily_weather.effects as weather_effects",
      "user_weather_protections.id as protection_id"
    );
  return { days: rows.map(shapeDay) };
}

module.exports = { buildSummary, buildEvents, buildDaily, shapeEvent, shapeDay };
