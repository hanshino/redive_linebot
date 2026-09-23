const { get } = require("lodash");
const config = require("config");
const mysql = require("../../util/mysql");
const UserAutoPreference = require("../../model/application/UserAutoPreference");
const SubscribeUser = require("../../model/application/SubscribeUser");
const SubscriptionService = require("../../service/SubscriptionService");
const GachaService = require("../../service/GachaService");
const GachaModel = require("../../model/princess/gacha");
const GachaBanner = require("../../model/princess/GachaBanner");
const MinigameService = require("../../service/MinigameService");
const EquipmentService = require("../../service/EquipmentService");
const WorldBossAttackService = require("../../service/WorldBossAttackService");
const commonTemplate = require("../../templates/common");
const { DefaultLogger } = require("../../util/Logger");

const VALID_FLAGS = [
  "auto_daily_gacha",
  "auto_janken_fate",
  "auto_janken_fate_with_bet",
  "auto_world_boss",
];
// Each flag declares which subscription effect gates it. with_bet re-uses the
// auto_janken_fate effect (it's a sub-option of the same feature).
const FLAG_EFFECT = {
  auto_daily_gacha: "auto_daily_gacha",
  auto_janken_fate: "auto_janken_fate",
  auto_janken_fate_with_bet: "auto_janken_fate",
  auto_world_boss: "auto_world_boss",
};
const VALID_MODES = ["normal", "pickup", "ensure", "europe"];
const VALID_WORLD_BOSS_MODES = ["standard", "skill"];
const HISTORY_DEFAULT_LIMIT = 30;
const HISTORY_MAX_LIMIT = 100;
const MAX_AUTO_MATCH_BET_CAP = 0xffffffff;
const MATCH_FIELDS = Object.freeze({
  match: {
    enabled: "auto_match_enabled",
    generation: "auto_match_generation",
  },
  match_bet: {
    enabled: "auto_match_bet_enabled",
    generation: "auto_match_bet_generation",
    cap: "auto_match_bet_cap",
  },
});

async function loadEntitlements(userId) {
  const [autoDailyGacha, autoJankenFate, autoWorldBoss] = await Promise.all([
    SubscriptionService.hasEffect(userId, "auto_daily_gacha"),
    SubscriptionService.hasEffect(userId, "auto_janken_fate"),
    SubscriptionService.hasEffect(userId, "auto_world_boss"),
  ]);
  return {
    auto_daily_gacha: autoDailyGacha,
    auto_janken_fate: autoJankenFate,
    auto_janken_fate_with_bet: autoJankenFate,
    auto_world_boss: autoWorldBoss,
  };
}

/**
 * auto_world_boss 預設開啟：沒有 user_auto_preference 列，或該列是在本功能上線前建立
 * （沒填過 auto_world_boss，DB 端已用欄位 DEFAULT 1 補上，見 migration
 * 20260923132724_add_auto_world_boss.js），一律視為已啟用。因此這裡刻意用
 * `row.auto_world_boss === 0` 當唯一的「關閉」條件，而不是像其它旗標那樣用
 * `=== 1` 當唯一的「開啟」條件 —— 兩者在語意上互為反相，此欄位的預設方向不同。
 */
async function loadPreference(userId) {
  const row = await UserAutoPreference.first({ filter: { user_id: userId } });
  const mode =
    row && VALID_MODES.includes(row.auto_daily_gacha_mode) ? row.auto_daily_gacha_mode : "normal";
  const worldBossMode =
    row && VALID_WORLD_BOSS_MODES.includes(row.auto_world_boss_mode)
      ? row.auto_world_boss_mode
      : "standard";
  return {
    auto_daily_gacha: row && row.auto_daily_gacha === 1 ? 1 : 0,
    auto_daily_gacha_mode: mode,
    auto_janken_fate: row && row.auto_janken_fate === 1 ? 1 : 0,
    auto_janken_fate_with_bet: row && row.auto_janken_fate_with_bet === 1 ? 1 : 0,
    auto_world_boss: row && row.auto_world_boss === 0 ? 0 : 1,
    auto_world_boss_mode: worldBossMode,
  };
}

async function activeMatchEligibility(userId, now = new Date(), trx) {
  const subscriptions = await SubscribeUser.findAllByUser(userId, trx);
  return SubscribeUser.hasActiveAutoMatchAt(subscriptions, now);
}

function matchView(kind, row, eligible) {
  const fields = MATCH_FIELDS[kind];
  const enabled = Boolean(row && row[fields.enabled] === 1);
  const view = {
    preference: kind,
    eligible,
    enabled,
    effective: eligible && enabled,
    generation: Number((row && row[fields.generation]) || 0),
  };
  if (fields.cap) view.cap = Number((row && row[fields.cap]) || 0);
  return view;
}

async function getMatchPreference(kind, req, res) {
  const userId = get(req, "profile.userId");
  if (!userId) return res.status(401).json({ error: "unauthenticated" });
  try {
    const now = new Date();
    const [row, eligible] = await Promise.all([
      UserAutoPreference.first({ filter: { user_id: userId } }),
      activeMatchEligibility(userId, now),
    ]);
    return res.json(matchView(kind, row, eligible));
  } catch {
    DefaultLogger.error(`auto-preference.${kind}.get failed`);
    return res.status(500).json({ error: "internal_error" });
  }
}

async function setMatchPreference(kind, req, res) {
  const userId = get(req, "profile.userId");
  if (!userId) return res.status(401).json({ error: "unauthenticated" });
  const body = req.body || {};
  if (typeof body.enabled !== "boolean") {
    return res.status(400).json({ error: "invalid_type", field: "enabled" });
  }
  if (body.enabled && body.acknowledged !== true) {
    return res.status(400).json({ error: "acknowledgement_required", field: "acknowledged" });
  }
  if (
    kind === "match_bet" &&
    body.cap !== undefined &&
    (!Number.isSafeInteger(body.cap) || body.cap < 0 || body.cap > MAX_AUTO_MATCH_BET_CAP)
  ) {
    return res.status(400).json({ error: "invalid_cap", field: "cap" });
  }

  try {
    const view = await mysql.transaction(async trx => {
      const user = await trx("user").where({ platform_id: userId }).forUpdate().first("id");
      if (!user) return { error: "user_not_found", status: 404 };
      const now = new Date();
      const subscriptions = await SubscribeUser.lockAllByUser(userId, trx);
      const eligible = SubscribeUser.hasActiveAutoMatchAt(subscriptions, now);
      const current = await UserAutoPreference.lockByUserId(userId, trx);
      if (body.enabled && !eligible) return { error: "subscription_required", status: 403 };

      const fields = MATCH_FIELDS[kind];
      const wasEnabled = Boolean(current && current[fields.enabled] === 1);
      const update = {
        [fields.enabled]: body.enabled ? 1 : 0,
        [fields.generation]:
          Number((current && current[fields.generation]) || 0) +
          (!wasEnabled && body.enabled ? 1 : 0),
      };
      if (fields.cap && body.cap !== undefined) update[fields.cap] = body.cap;
      if (current) {
        await UserAutoPreference.updateByUserId(userId, update, trx);
      } else {
        await UserAutoPreference.create({ user_id: userId, ...update }, trx);
      }
      const saved = await trx(UserAutoPreference.table).where({ user_id: userId }).first();
      return matchView(kind, saved, eligible);
    });
    if (view.error) return res.status(view.status).json({ error: view.error });
    return res.json(view);
  } catch {
    DefaultLogger.error(`auto-preference.${kind}.put failed`);
    return res.status(500).json({ error: "internal_error" });
  }
}

/**
 * 前端 AutoSettings 需要用來估算「依目前模式與配額，今晚大概會花多少女神石」。
 * 一併回傳歐洲活動是否進行中 — 無活動時前端要把 europe 選項灰階。
 */
async function loadGachaContext(userId) {
  const [stoneRaw, quota, europeBanners] = await Promise.all([
    GachaModel.getUserGodStoneCount(userId),
    GachaService.getRemainingDailyQuota(userId),
    GachaBanner.getActiveBannersWithCharacters({ type: "europe" }),
  ]);
  const activeEuropeBanner = europeBanners && europeBanners.length > 0 ? europeBanners[0] : null;
  return {
    stone_balance: parseInt(stoneRaw) || 0,
    daily_quota: quota,
    costs: {
      normal: 0,
      pickup: GachaService.resolveCost(true, false, false, null).amount,
      ensure: GachaService.resolveCost(false, true, false, null).amount,
      europe: GachaService.resolveCost(false, false, true, activeEuropeBanner).amount,
    },
    europe_banner_active: Boolean(activeEuropeBanner),
  };
}

/**
 * 前端 AutoSettings 的世界王攻擊方式選單要顯示「這位玩家」standard/skill 每次實際消耗
 * 的額度與技能名稱，算法必須跟 WorldBossAttackService#attackInput 完全一致
 * （RPGCharacter + 裝備 cost_reduction），否則兩邊數字會對不上——因此直接重用
 * WorldBossAttackService.resolveCosts，不在這裡另外算一份。
 * 純唯讀展示用途，失敗時整段 context 直接視為不可用（呼叫端用 .catch(() => null)）。
 */
async function loadWorldBossContext(userId) {
  const [progress, bonuses] = await Promise.all([
    MinigameService.findByUserId(userId),
    EquipmentService.getEquipmentBonuses(userId),
  ]);
  const resolvedProgress = progress || { level: 1, job_key: "adventurer" };
  const { standardCost, skillCost, skillName } = WorldBossAttackService.resolveCosts(
    resolvedProgress,
    bonuses
  );

  return {
    daily_cost_limit: config.get("worldboss.daily_cost_limit"),
    standard_cost: standardCost,
    skill_cost: skillCost,
    skill_name: skillName,
  };
}

exports.api = {};

exports.api.getPreference = async (req, res) => {
  try {
    const userId = get(req, "profile.userId");
    if (!userId) return res.status(401).json({ error: "unauthenticated" });

    const [preference, entitlements, gachaContext, worldBossContext] = await Promise.all([
      loadPreference(userId),
      loadEntitlements(userId),
      loadGachaContext(userId),
      loadWorldBossContext(userId).catch(() => null),
    ]);
    return res.json({
      ...preference,
      entitlements,
      gacha_context: gachaContext,
      world_boss_context: worldBossContext,
    });
  } catch (err) {
    DefaultLogger.error(`auto-preference.get failed: ${err && err.message}`);
    return res.status(500).json({ error: "internal_error" });
  }
};

exports.api.setPreference = async (req, res) => {
  try {
    const userId = get(req, "profile.userId");
    if (!userId) return res.status(401).json({ error: "unauthenticated" });

    const body = req.body || {};
    const update = {};
    for (const flag of VALID_FLAGS) {
      if (body[flag] === undefined || body[flag] === null) continue;
      const v = body[flag] === true || body[flag] === 1 || body[flag] === "1" ? 1 : 0;
      update[flag] = v;
    }
    let modeUpdate;
    if (body.auto_daily_gacha_mode !== undefined && body.auto_daily_gacha_mode !== null) {
      if (!VALID_MODES.includes(body.auto_daily_gacha_mode)) {
        return res.status(400).json({ error: "invalid_mode", field: "auto_daily_gacha_mode" });
      }
      modeUpdate = body.auto_daily_gacha_mode;
    }
    let worldBossModeUpdate;
    if (body.auto_world_boss_mode !== undefined && body.auto_world_boss_mode !== null) {
      if (!VALID_WORLD_BOSS_MODES.includes(body.auto_world_boss_mode)) {
        return res.status(400).json({ error: "invalid_mode", field: "auto_world_boss_mode" });
      }
      worldBossModeUpdate = body.auto_world_boss_mode;
    }
    if (
      Object.keys(update).length === 0 &&
      modeUpdate === undefined &&
      worldBossModeUpdate === undefined
    ) {
      const [preference, entitlements, gachaContext, worldBossContext] = await Promise.all([
        loadPreference(userId),
        loadEntitlements(userId),
        loadGachaContext(userId),
        loadWorldBossContext(userId).catch(() => null),
      ]);
      return res.json({
        ...preference,
        entitlements,
        gacha_context: gachaContext,
        world_boss_context: worldBossContext,
      });
    }

    const entitlements = await loadEntitlements(userId);
    for (const flag of Object.keys(update)) {
      if (update[flag] === 1 && !entitlements[FLAG_EFFECT[flag]]) {
        return res.status(403).json({ error: "entitlement_missing", field: flag });
      }
    }

    await mysql.raw(
      `INSERT INTO user_auto_preference
        (user_id, auto_daily_gacha, auto_daily_gacha_mode, auto_janken_fate, auto_janken_fate_with_bet,
         auto_world_boss, auto_world_boss_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         auto_daily_gacha = COALESCE(?, auto_daily_gacha),
         auto_daily_gacha_mode = COALESCE(?, auto_daily_gacha_mode),
         auto_janken_fate = COALESCE(?, auto_janken_fate),
         auto_janken_fate_with_bet = COALESCE(?, auto_janken_fate_with_bet),
         auto_world_boss = COALESCE(?, auto_world_boss),
         auto_world_boss_mode = COALESCE(?, auto_world_boss_mode)`,
      [
        userId,
        update.auto_daily_gacha === undefined ? 0 : update.auto_daily_gacha,
        modeUpdate === undefined ? "normal" : modeUpdate,
        update.auto_janken_fate === undefined ? 0 : update.auto_janken_fate,
        update.auto_janken_fate_with_bet === undefined ? 0 : update.auto_janken_fate_with_bet,
        // 新建列預設沿用 DB 欄位預設值（1/'standard'）：新建的 VALUES 分支沒有現成行可
        // COALESCE，只能顯式帶入同一組預設，行為對新舊列一致。
        update.auto_world_boss === undefined ? 1 : update.auto_world_boss,
        worldBossModeUpdate === undefined ? "standard" : worldBossModeUpdate,
        update.auto_daily_gacha === undefined ? null : update.auto_daily_gacha,
        modeUpdate === undefined ? null : modeUpdate,
        update.auto_janken_fate === undefined ? null : update.auto_janken_fate,
        update.auto_janken_fate_with_bet === undefined ? null : update.auto_janken_fate_with_bet,
        update.auto_world_boss === undefined ? null : update.auto_world_boss,
        worldBossModeUpdate === undefined ? null : worldBossModeUpdate,
      ]
    );

    const [preference, gachaContext, worldBossContext] = await Promise.all([
      loadPreference(userId),
      loadGachaContext(userId),
      loadWorldBossContext(userId).catch(() => null),
    ]);
    return res.json({
      ...preference,
      entitlements,
      gacha_context: gachaContext,
      world_boss_context: worldBossContext,
    });
  } catch (err) {
    DefaultLogger.error(`auto-preference.put failed: ${err && err.message}`);
    return res.status(500).json({ error: "internal_error" });
  }
};

exports.api.getMatchPreference = (req, res) => getMatchPreference("match", req, res);
exports.api.setMatchPreference = (req, res) => setMatchPreference("match", req, res);
exports.api.getMatchBetPreference = (req, res) => getMatchPreference("match_bet", req, res);
exports.api.setMatchBetPreference = (req, res) => setMatchPreference("match_bet", req, res);

exports.api.getHistory = async (req, res) => {
  try {
    const userId = get(req, "profile.userId");
    if (!userId) return res.status(401).json({ error: "unauthenticated" });

    const type = String(req.query.type || "all").toLowerCase();
    const rawLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(
      Math.max(isNaN(rawLimit) ? HISTORY_DEFAULT_LIMIT : rawLimit, 1),
      HISTORY_MAX_LIMIT
    );

    const rows = [];

    if (type === "all" || type === "gacha") {
      const gachaRows = await mysql("auto_gacha_job_log")
        .where({ user_id: userId })
        .orderBy("created_at", "desc")
        .limit(limit)
        .select(
          "run_date",
          "status",
          "pulls_made",
          "reward_summary",
          "error",
          "duration_ms",
          "created_at"
        );
      for (const r of gachaRows) {
        rows.push({
          type: "gacha",
          occurred_at: r.created_at,
          status: r.status,
          summary: {
            run_date: r.run_date,
            pulls_made: r.pulls_made,
            reward_summary: parseJsonSafe(r.reward_summary),
            error: r.error,
            duration_ms: r.duration_ms,
          },
        });
      }
    }

    if (type === "all" || type === "janken") {
      const jankenRows = await mysql("janken_auto_fate_log")
        .where({ user_id: userId })
        .orderBy("submitted_at", "desc")
        .limit(limit)
        .select("match_id", "role", "choice", "submitted_at");
      for (const r of jankenRows) {
        rows.push({
          type: "janken",
          occurred_at: r.submitted_at,
          status: "submitted",
          summary: {
            match_id: r.match_id,
            role: r.role,
            choice: r.choice,
          },
        });
      }
    }

    rows.sort((a, b) => {
      const ta = new Date(a.occurred_at).getTime();
      const tb = new Date(b.occurred_at).getTime();
      return tb - ta;
    });

    return res.json({ items: rows.slice(0, limit), limit, type });
  } catch (err) {
    DefaultLogger.error(`auto-history.get failed: ${err && err.message}`);
    return res.status(500).json({ error: "internal_error" });
  }
};

function parseJsonSafe(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch (e) {
    void e;
    return null;
  }
}

/**
 * LINE command handler: /#/.自動設定
 * Replies a Flex button bubble that opens the LIFF AutoSettings page.
 */
exports.showAutoSettings = async function (context) {
  const uri = commonTemplate.getLiffUri("tall", "/auto/settings");
  const bubble = commonTemplate.genActionBubble({
    icon: "⚙️",
    title: "自動設定",
    subtitle: "自動抽卡偏好",
    url: uri,
    theme: "emerald",
    cta: "開啟設定",
  });
  await context.replyFlex("自動設定", bubble);
};

// Internal exports for testing
exports._internal = {
  loadEntitlements,
  loadPreference,
  loadGachaContext,
  loadWorldBossContext,
  parseJsonSafe,
  VALID_MODES,
  VALID_WORLD_BOSS_MODES,
};
