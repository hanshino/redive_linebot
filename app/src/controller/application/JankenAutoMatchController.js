const moment = require("moment");
const mysql = require("../../util/mysql");
const { toUtc8Date } = require("../../util/date");
const JankenAutoMatchRun = require("../../model/application/JankenAutoMatchRun");
const JankenAutoMatchParticipant = require("../../model/application/JankenAutoMatchParticipant");
const JankenRecords = require("../../model/application/JankenRecords");
const SubscribeUser = require("../../model/application/SubscribeUser");
const UserAutoPreference = require("../../model/application/UserAutoPreference");
const { DefaultLogger } = require("../../util/Logger");

const TPE_OFFSET_MINUTES = 8 * 60;
const SCHEDULE_HOUR = 21;
const RESULT = Object.freeze({ 0: "draw", 1: "win", 2: "lose" });

function response(runDate, status, reason, match = null) {
  return { run_date: runDate, status, reason, match };
}

async function isCurrentlyParticipating(userId, now) {
  const [preference, subscriptions] = await Promise.all([
    UserAutoPreference.first({ filter: { user_id: userId } }),
    SubscribeUser.findEligibleByUser(userId),
  ]);
  return Boolean(
    preference &&
    preference.auto_match_enabled === 1 &&
    SubscribeUser.hasActiveAt(subscriptions, now)
  );
}

async function completedResult(participant, runDate) {
  const record = await mysql("janken_records")
    .where({ id: participant.match_id, source: JankenRecords.SOURCE.AUTO })
    .select(
      "bet_amount",
      "bet_fee",
      "p1_choice",
      "p2_choice",
      "elo_change",
      "streak_broken",
      "bounty_won",
      "created_at"
    )
    .first();
  const ownResult = await mysql("janken_result")
    .where({ record_id: participant.match_id, user_id: participant.user_id })
    .select("result")
    .first();
  if (!record || !ownResult || !RESULT[ownResult.result]) {
    return response(runDate, "failed", "result_unavailable");
  }

  const profile = await mysql("user")
    .where({ platform_id: participant.opponent_user_id })
    .select("display_name", "picture_url")
    .first();
  const isP1 = participant.role === JankenAutoMatchParticipant.ROLE.P1;
  const result = RESULT[ownResult.result];
  return response(runDate, "completed", null, {
    result,
    choice: isP1 ? record.p1_choice : record.p2_choice,
    opponentChoice: isP1 ? record.p2_choice : record.p1_choice,
    occurredAt: record.created_at,
    settlement: {
      betAmount: Number(record.bet_amount || 0),
      fee: Number(record.bet_fee || 0),
      // The durable record stores only the winner's ELO delta. Never infer a loser's delta by
      // negation: lossFactor means it is not necessarily symmetric.
      eloChange: result === "win" && record.elo_change !== null ? Number(record.elo_change) : null,
      streakBroken: record.streak_broken === null ? null : Number(record.streak_broken),
      bountyWon: result === "win" ? Number(record.bounty_won || 0) : 0,
    },
    opponent: {
      displayName: (profile && profile.display_name) || "unknown",
      pictureUrl: (profile && profile.picture_url) || null,
    },
  });
}

async function getTodayResult(userId, now = new Date()) {
  const runDate = toUtc8Date(now);
  const participant = await JankenAutoMatchParticipant.findByUserAndDate(userId, runDate);
  if (participant) {
    switch (participant.status) {
      case JankenAutoMatchParticipant.STATUS.COMPLETED:
        return completedResult(participant, runDate);
      case JankenAutoMatchParticipant.STATUS.BYE:
        return response(runDate, "bye", "no_opponent");
      case JankenAutoMatchParticipant.STATUS.FAILED:
        return response(runDate, "failed", "match_failed");
      case JankenAutoMatchParticipant.STATUS.NOT_STARTED:
        return response(runDate, "failed", "not_started");
      default:
        return response(runDate, "failed", "invalid_manifest_status");
    }
  }

  const run = await JankenAutoMatchRun.findByDate(runDate);
  if (run) return response(runDate, "not_executed", "not_in_run");

  const participating = await isCurrentlyParticipating(userId, now);
  if (!participating) return response(runDate, "not_executed", "not_participating");

  const taipeiNow = moment(now).utcOffset(TPE_OFFSET_MINUTES);
  return taipeiNow.hour() < SCHEDULE_HOUR
    ? response(runDate, "not_executed", "waiting_for_schedule")
    : response(runDate, "not_executed", "run_not_executed");
}

exports.api = {
  today: async (req, res) => {
    const userId = req.profile && req.profile.userId;
    if (!userId) return res.status(401).json({ error: "unauthenticated" });
    try {
      return res.json(await getTodayResult(userId));
    } catch {
      DefaultLogger.error("janken.auto-match.today failed");
      return res.status(500).json({ error: "internal_error" });
    }
  },
};

exports._internal = { getTodayResult, completedResult };
