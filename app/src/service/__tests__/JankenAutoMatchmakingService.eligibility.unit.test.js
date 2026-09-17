// All IO is mocked by setup.js or below; exercise real subscription qualification.
jest.mock("../JankenService", () => ({
  settleMatchInTransaction: jest.fn(),
  isRetryableLockError: jest.fn(() => false),
}));
const mysql = require("../../util/mysql");
const SubscribeUser = require("../../model/application/SubscribeUser");
const Preference = require("../../model/application/UserAutoPreference");
const Participant = require("../../model/application/JankenAutoMatchParticipant");
const Run = require("../../model/application/JankenAutoMatchRun");
const Core = require("../JankenService");
const Service = require("../JankenAutoMatchmakingService");
const ResultController = require("../../controller/application/JankenAutoMatchController");

const now = new Date("2026-09-16T12:00:00Z");
const row = (key, start = +now - 1, end = +now + 1) => ({
  subscribe_card_key: key,
  start_at: new Date(start),
  end_at: new Date(end),
});

afterEach(() => jest.restoreAllMocks());
beforeEach(() => jest.clearAllMocks());

test("Plus-only half-open interval, no ordinary/season fallback", () => {
  expect(SubscribeUser.eligibleAutoMatchCardKeys).toEqual(["month_plus"]);
  for (const key of ["month", "season", "unknown"]) {
    expect(SubscribeUser.hasActiveAutoMatchAt([row(key)], now)).toBe(false);
  }
  expect(SubscribeUser.hasActiveAutoMatchAt([row("month_plus", +now)], now)).toBe(true);
  expect(SubscribeUser.hasActiveAutoMatchAt([row("month_plus", +now + 1)], now)).toBe(false);
  expect(
    SubscribeUser.hasActiveAutoMatchAt([row("month_plus", +now - 1, +now), row("season")], now)
  ).toBe(false);
});

test("all-row lock uses supplied transaction and ascending id, never a card filter", async () => {
  const query = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    forUpdate: jest.fn().mockResolvedValue([]),
  };
  const trx = jest.fn(() => query);
  await SubscribeUser.lockAllByUser("u", trx);
  expect(trx).toHaveBeenCalledWith("subscribe_user");
  expect(query.where).toHaveBeenCalledWith({ user_id: "u" });
  expect(query.orderBy).toHaveBeenCalledWith("id", "asc");
  expect(query.forUpdate).toHaveBeenCalledTimes(1);
});

test("manifest SQL uses central Plus keys and current-time bounds", async () => {
  jest.spyOn(Run, "tryClaim").mockResolvedValue(true);
  jest.spyOn(Participant, "findByeUserIds").mockResolvedValue([]);
  const query = {};
  for (const method of ["join", "where", "whereIn", "distinct"])
    query[method] = jest.fn(() => query);
  query.orderBy = jest.fn().mockResolvedValue([]);
  const trx = jest.fn(() => query);
  mysql.transaction.mockImplementationOnce(cb => cb(trx));
  await Service.createDailyManifest({ runDate: "2026-09-16", now });
  expect(query.whereIn).toHaveBeenCalledWith(
    "s.subscribe_card_key",
    SubscribeUser.eligibleAutoMatchCardKeys
  );
  expect(query.where).toHaveBeenCalledWith("s.start_at", "<=", now);
  expect(query.where).toHaveBeenCalledWith("s.end_at", ">", now);
});

test.each(["month", "season", "expired_plus", "month_plus"])(
  "execution rechecks %s rather than trusting manifest",
  async key => {
    const participants = ["b", "a"].map((id, index) => ({
      user_id: id,
      role: index ? "p2" : "p1",
      status: "not_started",
      run_date: "2026-09-16",
      match_generation: 1,
      bet_generation: 1,
      bet_enabled: 1,
      bet_cap: 500,
    }));
    jest.spyOn(Participant, "findByMatchId").mockResolvedValue(participants);
    jest.spyOn(Participant, "markFailed").mockResolvedValue();
    const lock = jest
      .spyOn(SubscribeUser, "lockAllByUser")
      .mockResolvedValue(
        key === "expired_plus" ? [row("month_plus", +now - 1, +now), row("month")] : [row(key)]
      );
    jest.spyOn(Preference, "lockByUserId").mockResolvedValue({
      auto_match_enabled: 1,
      auto_match_generation: 1,
      auto_match_bet_enabled: 1,
      auto_match_bet_generation: 1,
      auto_match_bet_cap: 500,
    });
    let authorization;
    Core.settleMatchInTransaction.mockImplementation(async (trx, params) => {
      // Real core owns user/participant locks; this seam tests only its authorization hook.
      authorization = await params.auto.authorize({ trx, participants });
      if (!authorization.proceed)
        throw Object.assign(new Error("revoked"), { code: "AUTHORIZATION_REVOKED" });
      return {};
    });
    const result = await Service.executeMatch({
      matchId: "m",
      now: new Date(+now - 1),
      clock: () => now,
    });
    expect(lock.mock.calls.map(args => args[0])).toEqual(["a", "b"]);
    expect(authorization.proceed).toBe(key === "month_plus");
    if (key === "month_plus") {
      expect(result.status).toBe("completed");
      expect(authorization.betCandidate).toBe(500);
    } else {
      expect(result.error.code).toBe("AUTHORIZATION_REVOKED");
      expect(Participant.markFailed).toHaveBeenCalledWith("m");
    }
  }
);

test("completed result remains readable without current eligibility", async () => {
  jest.spyOn(Participant, "findByUserAndDate").mockResolvedValue({
    status: "completed",
    match_id: "m",
    user_id: "u",
    role: "p1",
    opponent_user_id: "v",
  });
  const eligibility = jest
    .spyOn(SubscribeUser, "findAllByUser")
    .mockResolvedValue([row("month_plus", +now - 1, +now)]);
  mysql.first
    .mockResolvedValueOnce({ p1_choice: "rock", p2_choice: "scissors" })
    .mockResolvedValueOnce({ result: 1 })
    .mockResolvedValueOnce({ display_name: "opponent" });
  const result = await ResultController._internal.getTodayResult("u", now);
  expect(result.status).toBe("completed");
  expect(result.match.result).toBe("win");
  expect(eligibility).not.toHaveBeenCalled();
});
