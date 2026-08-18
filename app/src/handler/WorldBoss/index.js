const { canonicalPositiveInteger } = require("../../util/decimalInteger");

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const BAD_REQUEST_CODES = new Set([
  "INVALID_ID",
  "INVALID_BOSS_NAME",
  "INVALID_HP_WEIGHT",
  "INVALID_NAME",
  "INVALID_END_TIME",
  "INVALID_DATE",
  "INVALID_RANKING_LIMIT",
  "INVALID_ROSTER_SIZE",
  "INVALID_ROSTER_BOSS_ID",
  "DUPLICATE_ROSTER_BOSS",
  "INVALID_ROUND_ID",
  "INVALID_ATTACK_TYPE",
  "INVALID_GROUP_ID",
  "INVALID_USER",
]);
// Board-state conflicts: the client's view is stale, so the fix is always "refresh".
const CONFLICT_CODES = new Set([
  "BOSS_IN_USE",
  "SEASON_NOT_DRAFT",
  "ANOTHER_SEASON_ACTIVE",
  "ROUND_NOT_FOUND",
  "ROUND_STALE",
  "ROUND_CLEARED",
  "NO_ACTIVE_SEASON",
  "SEASON_ENDED",
  "NO_ACTIVE_ROUND",
]);
const NOT_FOUND_CODES = new Set(["SEASON_NOT_FOUND"]);
// Understood, well-formed, but not actionable right now — refreshing will not help.
const UNPROCESSABLE_CODES = new Set([
  "NO_WORLD_BOSS",
  "INVALID_MAX_HP",
  "WORLD_BOSS_NOT_FOUND",
  "INVALID_SEASON_ROSTER",
  "DAILY_LIMIT_EXCEEDED",
]);
const TOO_MANY_REQUESTS_CODES = new Set(["ATTACK_COOLDOWN"]);

function toApiDto(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toApiDto);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, toApiDto(child)]));
}

function respondError(res, error) {
  const code = error && error.code;
  if (BAD_REQUEST_CODES.has(code)) return res.status(400).json({ error: code });
  if (CONFLICT_CODES.has(code)) return res.status(409).json({ error: code });
  if (NOT_FOUND_CODES.has(code)) return res.status(404).json({ error: code });
  if (UNPROCESSABLE_CODES.has(code)) return res.status(422).json({ error: code });
  if (TOO_MANY_REQUESTS_CODES.has(code)) return res.status(429).json({ error: code });
  console.error("[world-boss-api]", error);
  return res.status(500).json({ error: "INTERNAL_ERROR" });
}

function fail(code) {
  return Object.assign(new Error(code), { code });
}

function parseId(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) throw fail("INVALID_ID");
  try {
    return canonicalPositiveInteger(value);
  } catch {
    throw fail("INVALID_ID");
  }
}

function parseUtcDate(value) {
  if (typeof value !== "string" || !ISO_DATETIME.test(value)) throw fail("INVALID_END_TIME");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value)
    throw fail("INVALID_END_TIME");
  return date;
}

function parseLeaderboardLimit(value) {
  if (value === undefined) return 50;
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw fail("INVALID_RANKING_LIMIT");
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw fail("INVALID_RANKING_LIMIT");
  }
  return limit;
}

module.exports = {
  toApiDto,
  respondError,
  fail,
  parseId,
  parseUtcDate,
  parseLeaderboardLimit,
};
