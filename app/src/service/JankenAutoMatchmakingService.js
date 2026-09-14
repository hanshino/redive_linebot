/**
 * U2：每日自動配對的純配對演算法（R8）＋可注入 RNG（KTD15）。純函式：不連 DB／Redis、
 * 不產生 match_id、不判斷下注金額或授權交集（U3 execution 的事）、不 mutate 輸入。
 *
 * Input:  `{ userId, wantsBet, wasByeYesterday }[]`（呼叫端先篩好 R1/R2 資格與 R9 昨日狀態）
 * Options: `{ rng?: () => number }`（預設 `Math.random`；固定序列可重現，KTD15）
 * Output: `{ pairs: { userAId, userBId, betIntentMatched }[], byeUserIds: string[] }`
 *   每個輸入 userId 恰出現一次（pairs 或 byeUserIds 之一）；`userAId`/`userBId` 依輸入原順序排列。
 *
 * 優先層（R8）：`wasByeYesterday` 決定「誰先被服務」，不是把該層關在自己的小池子裡配對——
 * 同層內用 `rng` 洗牌決定服務順序，被服務者的對象一律優先同層、其次全體剩餘池，
 * 這樣 bye 只會落在可行範圍內優先權最低的一層，不會出現「昨日輪空者因意願不同而 bye」。
 * 選對象時：先同下注意願（R8 第二項），找不到才跨意願；同分類多名候選人用 `rng` 等機率選一位。
 */
function pairForDailyRun(candidates, options = {}) {
  const rng = options.rng || Math.random;
  const pool = candidates.slice();
  const originalIndex = new Map(candidates.map((c, idx) => [c.userId, idx]));

  const tier1 = shuffle(
    candidates.filter(c => c.wasByeYesterday),
    rng
  );
  const tier2 = shuffle(
    candidates.filter(c => !c.wasByeYesterday),
    rng
  );
  const processOrder = [...tier1, ...tier2].map(c => c.userId);

  const pairs = [];

  for (const userId of processOrder) {
    const selfIndex = pool.findIndex(c => c.userId === userId);
    if (selfIndex === -1) continue; // 已在更早的迭代中被配走

    const self = pool[selfIndex];
    const rest = pool.filter(c => c.userId !== userId);
    if (rest.length === 0) continue; // 剩自己一人，留在池中、稍後結算為 bye

    const sameTier = rest.filter(c => c.wasByeYesterday === self.wasByeYesterday);
    const tierPool = sameTier.length > 0 ? sameTier : rest;
    const sameIntent = tierPool.filter(c => c.wantsBet === self.wantsBet);
    const partnerPool = sameIntent.length > 0 ? sameIntent : tierPool;
    const partner = pickRandom(partnerPool, rng);

    const [userAId, userBId] =
      originalIndex.get(self.userId) < originalIndex.get(partner.userId)
        ? [self.userId, partner.userId]
        : [partner.userId, self.userId];

    pairs.push({ userAId, userBId, betIntentMatched: partner.wantsBet === self.wantsBet });

    removeById(pool, self.userId);
    removeById(pool, partner.userId);
  }

  return { pairs, byeUserIds: pool.map(c => c.userId) };
}

/** Fisher-Yates，用注入的 `rng` 洗牌，回傳新陣列（不 mutate `arr`）。 */
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 等機率隨機選一個；僅 1 個候選時直接回傳、不呼叫 `rng`（避免消耗無意義的注入序列）。 */
function pickRandom(pool, rng) {
  if (pool.length === 1) return pool[0];
  const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
  return pool[index];
}

function removeById(pool, userId) {
  const index = pool.findIndex(c => c.userId === userId);
  pool.splice(index, 1);
}

// ---------------------------------------------------------------------------------------
// U3：manifest（KTD1／KTD2）與每場執行交易（KTD3／KTD12）。
// 只有 createDailyManifest／executeMatch 需要 DB 相關模組；延後到第一次呼叫才 require，
// 讓上半部純函式（pairForDailyRun）在 jest 全域 mock 之外也能被 require 而不觸碰 DB 連線。
const moment = require("moment");
const uuid = require("uuid-random");
const config = require("config");
const { toUtc8Date } = require("../util/date");

let runtime;
function deps() {
  if (!runtime) {
    runtime = {
      mysql: require("../util/mysql"),
      JankenService: require("./JankenService"),
      JankenAutoMatchRun: require("../model/application/JankenAutoMatchRun"),
      JankenAutoMatchParticipant: require("../model/application/JankenAutoMatchParticipant"),
      UserAutoPreference: require("../model/application/UserAutoPreference"),
      JankenRecords: require("../model/application/JankenRecords"),
      DefaultLogger: require("../util/Logger").DefaultLogger,
    };
    runtime.STATUS = runtime.JankenAutoMatchParticipant.STATUS;
    runtime.ROLE = runtime.JankenAutoMatchParticipant.ROLE;
  }
  return runtime;
}
/** R1：月卡或季卡（不分取得管道）。與 KTD11 re-consent 的卡種集合一致。 */
const ELIGIBLE_CARD_KEYS = ["month", "season"];
/** 有界重試次數，比照 SubscribeController.EXCHANGE_MAX_ATTEMPTS 的風格。 */
const EXECUTE_MAX_ATTEMPTS = 3;
const CHOICES = ["rock", "paper", "scissors"];

const drawChoice = rng => CHOICES[Math.min(CHOICES.length - 1, Math.floor(rng() * CHOICES.length))];
const yesterdayOf = runDate =>
  moment(runDate, "YYYY-MM-DD").subtract(1, "day").format("YYYY-MM-DD");
const isActiveAt = (row, now) => new Date(row.start_at) <= now && now < new Date(row.end_at);

/**
 * 交易內鎖住該使用者所有 month/season 的 subscribe_user 列，並以固定 `now` 判斷是否仍有任一有效（R1／R4）。
 * 鎖序 ③ 的前半（subscribe_user）；與 KTD11 的 `start_at <= now < end_at` 邊界一致。
 */
async function lockActiveEligibility(trx, userId, now) {
  const rows = await trx("subscribe_user")
    .where({ user_id: userId })
    .whereIn("subscribe_card_key", ELIGIBLE_CARD_KEYS)
    .orderBy("id", "asc")
    .forUpdate();
  return rows.some(row => isActiveAt(row, now));
}

/**
 * 每日 manifest：claim（普通 INSERT 撞 PK 即當天已跑）→ 讀合格＋已開啟配對意願者 → R8 配對 →
 * 一次寫入不可變 manifest（對手、角色、預抽出拳、KTD12 快照、bye／not_started）。全部在同一交易內。
 *
 * @param {Object} params
 * @param {String} params.runDate "YYYY-MM-DD"（Asia/Taipei 曆日）
 * @param {Date} [params.now] 資格判斷用的固定時鐘（KTD15）
 * @param {() => number} [params.rng] 配對與出拳共用的 RNG（KTD15）
 * @param {() => string} [params.newMatchId] 測試可注入；預設 uuid
 * @returns {Promise<{claimed:boolean, runDate:string, matches:Array<{matchId,p1UserId,p2UserId}>, byeUserIds:string[]}>}
 */
async function createDailyManifest({
  runDate,
  now = new Date(),
  rng = Math.random,
  newMatchId = uuid,
}) {
  const { mysql, JankenAutoMatchRun, JankenAutoMatchParticipant, STATUS, ROLE } = deps();
  return mysql.transaction(async trx => {
    const claimed = await JankenAutoMatchRun.tryClaim(runDate, trx);
    if (!claimed) return { claimed: false, runDate, matches: [], byeUserIds: [] };

    const rows = await trx("user_auto_preference as p")
      .join("subscribe_user as s", "s.user_id", "p.user_id")
      .where("p.auto_match_enabled", 1)
      .whereIn("s.subscribe_card_key", ELIGIBLE_CARD_KEYS)
      .where("s.start_at", "<=", now)
      .where("s.end_at", ">", now)
      .distinct(
        "p.user_id",
        "p.auto_match_generation",
        "p.auto_match_bet_enabled",
        "p.auto_match_bet_generation",
        "p.auto_match_bet_cap"
      )
      .orderBy("p.user_id", "asc");

    const yesterdayByes = new Set(
      await JankenAutoMatchParticipant.findByeUserIds(yesterdayOf(runDate), trx)
    );
    const prefById = new Map(rows.map(row => [row.user_id, row]));
    // 配對用的「下注意願」= 是否開啟下注同意（R8 第二項），只看 enabled，不看 cap：
    // cap 只影響 U3 execution 實際結算金額（含 cap=0 導致免費對戰，R15），不該改變 R8 的分類優先序，
    // 否則 cap=0 但仍想下注的使用者會被錯配到「不下注」池，違反「同下注意願優先」。
    const candidates = rows.map(row => ({
      userId: row.user_id,
      wantsBet: row.auto_match_bet_enabled === 1,
      wasByeYesterday: yesterdayByes.has(row.user_id),
    }));
    const { pairs, byeUserIds } = pairForDailyRun(candidates, { rng });

    const snapshotOf = userId => {
      const pref = prefById.get(userId);
      return {
        match_generation: pref.auto_match_generation,
        bet_enabled: pref.auto_match_bet_enabled === 1,
        bet_generation: pref.auto_match_bet_generation,
        bet_cap: pref.auto_match_bet_cap,
      };
    };

    const manifest = [];
    const matches = [];
    for (const pair of pairs) {
      const matchId = newMatchId();
      const p1Choice = drawChoice(rng);
      const p2Choice = drawChoice(rng);
      manifest.push({
        run_date: runDate,
        user_id: pair.userAId,
        match_id: matchId,
        role: ROLE.P1,
        opponent_user_id: pair.userBId,
        choice: p1Choice,
        status: STATUS.NOT_STARTED,
        ...snapshotOf(pair.userAId),
      });
      manifest.push({
        run_date: runDate,
        user_id: pair.userBId,
        match_id: matchId,
        role: ROLE.P2,
        opponent_user_id: pair.userAId,
        choice: p2Choice,
        status: STATUS.NOT_STARTED,
        ...snapshotOf(pair.userBId),
      });
      matches.push({ matchId, p1UserId: pair.userAId, p2UserId: pair.userBId });
    }
    for (const userId of byeUserIds) {
      manifest.push({
        run_date: runDate,
        user_id: userId,
        status: STATUS.BYE,
        ...snapshotOf(userId),
      });
    }
    if (manifest.length > 0) await JankenAutoMatchParticipant.insertManifest(manifest, trx);

    return { claimed: true, runDate, matches, byeUserIds };
  });
}

/**
 * KTD12 授權交集（在 core 的 ② 之後、④ 之前被呼叫；負責鎖序 ③）。
 * 參與：訂閱仍有效 且 即時 enabled 且 快照 generation === 即時 generation，任一方不成立 → 不進行（該場 failed）。
 * 下注：雙方都 快照 enabled && 即時 enabled && generation 相同 才算同意；cap 取 min(快照, 即時)；
 *       candidate = min(雙方 cap)，低於手動對戰既有最低下注額則視為不下注。只縮不擴。
 */
async function authorizeParticipants({ trx, participants }, now) {
  const { UserAutoPreference } = deps();
  const ordered = [...participants].sort((a, b) => (a.user_id < b.user_id ? -1 : 1));
  const eligible = {};
  for (const p of ordered) eligible[p.user_id] = await lockActiveEligibility(trx, p.user_id, now);
  const prefs = {};
  for (const p of ordered) prefs[p.user_id] = await UserAutoPreference.lockByUserId(p.user_id, trx);

  const caps = [];
  for (const p of ordered) {
    const pref = prefs[p.user_id];
    const participating =
      eligible[p.user_id] &&
      pref &&
      pref.auto_match_enabled === 1 &&
      pref.auto_match_generation === p.match_generation;
    if (!participating) return { proceed: false, reason: `participation_revoked:${p.role}` };

    const betConsent =
      p.bet_enabled === 1 &&
      pref.auto_match_bet_enabled === 1 &&
      pref.auto_match_bet_generation === p.bet_generation;
    caps.push(betConsent ? Math.min(p.bet_cap, pref.auto_match_bet_cap) : 0);
  }

  const minBet = config.get("minigame.janken.bet.minAmount");
  let betCandidate = Math.min(...caps);
  if (!Number.isSafeInteger(betCandidate) || betCandidate < minBet) betCandidate = 0;
  return { proceed: true, betCandidate };
}

/**
 * 執行一場 manifest 中的對戰：manifest 固定的對手／角色／出拳不重抽；整場在一個交易內結算
 * （KTD3 inline funding），失敗 rollback 後用 status-only CAS 標 failed；只對 deadlock／lock-wait 有界重試。
 * 已 completed／failed 的場次直接跳過（AE9／AE13：重啟不重打、不二扣）。
 *
 * `now` 與 `clock` 是兩個分離的時間來源：`now`（事件歸屬時鐘）只用來寫 `occurred_at`（不影響
 * 已固定的 `run_date`），代表這場「事實上發生」的時間點；`clock`（授權檢查時鐘）決定 R4／KTD12
 * 資格重讀當下要用哪個時間點判斷 `subscribe_user` 是否仍有效——manifest 建立後到實際執行可能
 * 隔了一段時間（甚至整批延後執行），若沿用建立 manifest 當下的 `now` 判資格，訂閱在這段期間內
 * 到期也不會被抓到。`clock` 在每一次 transaction attempt「開始時」呼叫一次並固定傳入該次
 * attempt 的 `authorize`，同一 attempt 內不重讀；跨 attempt（例如 deadlock 重試）則重新呼叫，
 * 讓重試中途才過期的訂閱也能在下一次 attempt 被抓到。
 *
 * @param {Object} params
 * @param {String} params.matchId
 * @param {Date} [params.now] 事件歸屬（`occurred_at`）時鐘；不影響授權檢查。
 * @param {() => Date} [params.clock] 授權檢查（R4／KTD12）時鐘。未提供時退回 `() => now`，
 *   維持既有「只傳 now」呼叫方式的相容行為；生產進入點（`runDailyAutoMatch`）會明確傳入
 *   獨立於 `now` 的即時 `clock`，不應由本函式的預設值決定生產行為。
 * @param {Number} [params.maxAttempts]
 * @returns {Promise<{matchId:string, status:string, result?:Object, error?:Error, attempts:number}>}
 */
async function executeMatch({
  matchId,
  now = new Date(),
  clock = () => now,
  maxAttempts = EXECUTE_MAX_ATTEMPTS,
}) {
  const {
    mysql,
    JankenService,
    JankenAutoMatchParticipant,
    JankenRecords,
    DefaultLogger,
    STATUS,
    ROLE,
  } = deps();
  const participants = await JankenAutoMatchParticipant.findByMatchId(matchId);
  if (participants.length !== 2) return { matchId, status: "missing", attempts: 0 };
  if (participants.some(p => p.status !== STATUS.NOT_STARTED)) {
    return { matchId, status: participants[0].status, skipped: true, attempts: 0 };
  }
  const p1 = participants.find(p => p.role === ROLE.P1);
  const p2 = participants.find(p => p.role === ROLE.P2);
  // DATE 欄位經 +08 連線回來是 Date 物件；用 UTC+8 折回曆日，避免行程 TZ 不同時少一天。
  const runDate = toUtc8Date(p1.run_date);

  // manifest 已固定（對手／角色／出拳），跨 attempt 只重跑交易、不重抽；授權檢查時鐘則每次重取。
  const baseParams = {
    matchId,
    groupId: null,
    p1UserId: p1.user_id,
    p2UserId: p2.user_id,
    p1Choice: p1.choice,
    p2Choice: p2.choice,
    funding: "inline",
    source: JankenRecords.SOURCE.AUTO,
  };

  let lastError;
  let attempts = 0;
  while (attempts < maxAttempts) {
    attempts += 1;
    // 每次 attempt 開始才取一次時間，同一 attempt 內固定（傳給 authorize 的是這個值，不是 clock 本身）。
    const eligibilityNow = clock();
    const params = {
      ...baseParams,
      auto: {
        runDate,
        occurredAt: now,
        authorize: ctx => authorizeParticipants(ctx, eligibilityNow),
      },
    };
    try {
      const result = await mysql.transaction(trx =>
        JankenService.settleMatchInTransaction(trx, params)
      );
      return { matchId, status: STATUS.COMPLETED, result, attempts };
    } catch (error) {
      lastError = error;
      if (JankenService.isRetryableLockError(error) && attempts < maxAttempts) continue;
      break;
    }
  }

  if (lastError && lastError.code === "MATCH_NOT_PENDING") {
    // 別的 worker 已把這場推進，不是失敗；回報當下狀態。
    const rows = await JankenAutoMatchParticipant.findByMatchId(matchId);
    return { matchId, status: rows[0] ? rows[0].status : "missing", skipped: true, attempts };
  }

  DefaultLogger.error(
    `[AutoJanken] match failed match_id=${matchId} code=${lastError && lastError.code} attempts=${attempts}`
  );
  // rollback 之後的極短 status-only CAS；不含任何金流。
  await JankenAutoMatchParticipant.markFailed(matchId);
  const rows = await JankenAutoMatchParticipant.findByMatchId(matchId);
  return { matchId, status: rows[0] ? rows[0].status : "missing", error: lastError, attempts };
}

/**
 * 一天一次的完整流程：claim＋manifest → 逐場獨立交易。claim 失敗（當天已跑）直接結束、不重打。
 *
 * `now`／`clock` 語意同 `executeMatch`：`now` 只決定 manifest 建立當下的資格快照與每場的
 * `occurred_at` 事件歸屬時間；`clock` 是每場執行、每次 attempt 各自重新取值的授權檢查時鐘，
 * 預設 `() => new Date()`——若把整批 `now` 原樣塞進 `clock`，晚執行（甚至隔一段時間才跑）的
 * 場次就會用 manifest 建立當下的舊時間判斷訂閱是否仍有效，這正是本次要修的錯誤，不能重犯。
 */
async function runDailyAutoMatch({
  runDate,
  now = new Date(),
  clock = () => new Date(),
  rng = Math.random,
} = {}) {
  const manifest = await createDailyManifest({ runDate, now, rng });
  if (!manifest.claimed) return { ...manifest, results: [] };
  const results = [];
  for (const match of manifest.matches) {
    results.push(await executeMatch({ matchId: match.matchId, now, clock }));
  }
  return { ...manifest, results };
}

module.exports = {
  pairForDailyRun,
  createDailyManifest,
  executeMatch,
  runDailyAutoMatch,
  ELIGIBLE_CARD_KEYS,
  EXECUTE_MAX_ATTEMPTS,
};
