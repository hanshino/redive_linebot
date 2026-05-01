const moment = require("moment");
const ChatExpEvent = require("../model/application/ChatExpEvent");
const ChatExpDaily = require("../model/application/ChatExpDaily");
const UserBlessing = require("../model/application/UserBlessing");

const TIER1_BASE = 400;
const TIER1_BLESSING4 = 600;
const TIER2_BASE = 1000;
const TIER2_BLESSING5 = 1200;

function todayDateUtc8() {
  return moment().utcOffset(480).format("YYYY-MM-DD");
}

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
  };
}

async function buildSummary(userId) {
  const date = todayDateUtc8();
  const [daily, blessingIds, lastEvent] = await Promise.all([
    ChatExpDaily.findByUserDate(userId, date),
    UserBlessing.listBlessingIdsByUserId(userId),
    ChatExpEvent.findLatestByUser(userId),
  ]);

  const ids = Array.isArray(blessingIds) ? blessingIds : [];
  const tier1Upper = ids.includes(4) ? TIER1_BLESSING4 : TIER1_BASE;
  const tier2Upper = ids.includes(5) ? TIER2_BLESSING5 : TIER2_BASE;

  const dailyRaw = daily?.raw_exp ?? 0;
  const today = {
    date,
    raw_exp: dailyRaw,
    effective_exp: daily?.effective_exp ?? 0,
    msg_count: daily?.msg_count ?? 0,
    daily_raw: dailyRaw,
    tier: deriveTier(dailyRaw, tier1Upper, tier2Upper),
    tier1_upper: tier1Upper,
    tier2_upper: tier2Upper,
    honeymoon_active: Boolean(daily?.honeymoon_active),
    active_trial_star: null, // populated below if last_event has it
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

async function buildDaily(userId, { from, to }) {
  const rows = await ChatExpDaily.model.all({
    filter: {
      user_id: userId,
      date: { operator: ">=", value: from },
    },
    order: [{ column: "date", direction: "asc" }],
  });
  // Filter `to` in JS — base model's filter dialect doesn't compose two operators on the same key.
  const filtered = rows.filter(r => r.date <= to);
  return {
    days: filtered.map(r => ({
      date: r.date,
      raw_exp: r.raw_exp,
      effective_exp: r.effective_exp,
      msg_count: r.msg_count,
      honeymoon_active: Boolean(r.honeymoon_active),
      trial_id: r.trial_id ?? null,
    })),
  };
}

module.exports = { buildSummary, buildEvents, buildDaily };
