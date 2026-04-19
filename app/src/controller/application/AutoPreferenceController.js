const { get } = require("lodash");
const mysql = require("../../util/mysql");
const UserAutoPreference = require("../../model/application/UserAutoPreference");
const SubscriptionService = require("../../service/SubscriptionService");
const GachaService = require("../../service/GachaService");
const GachaModel = require("../../model/princess/gacha");
const GachaBanner = require("../../model/princess/GachaBanner");
const commonTemplate = require("../../templates/common");
const { DefaultLogger } = require("../../util/Logger");

const VALID_FLAGS = ["auto_daily_gacha", "auto_janken_fate", "auto_janken_fate_with_bet"];
// Each flag declares which subscription effect gates it. with_bet re-uses the
// auto_janken_fate effect (it's a sub-option of the same feature).
const FLAG_EFFECT = {
  auto_daily_gacha: "auto_daily_gacha",
  auto_janken_fate: "auto_janken_fate",
  auto_janken_fate_with_bet: "auto_janken_fate",
};
const VALID_MODES = ["normal", "pickup", "ensure", "europe"];
const HISTORY_DEFAULT_LIMIT = 30;
const HISTORY_MAX_LIMIT = 100;

async function loadEntitlements(userId) {
  const [autoDailyGacha, autoJankenFate] = await Promise.all([
    SubscriptionService.hasEffect(userId, "auto_daily_gacha"),
    SubscriptionService.hasEffect(userId, "auto_janken_fate"),
  ]);
  return {
    auto_daily_gacha: autoDailyGacha,
    auto_janken_fate: autoJankenFate,
    auto_janken_fate_with_bet: autoJankenFate,
  };
}

async function loadPreference(userId) {
  const row = await UserAutoPreference.first({ filter: { user_id: userId } });
  const mode =
    row && VALID_MODES.includes(row.auto_daily_gacha_mode) ? row.auto_daily_gacha_mode : "normal";
  return {
    auto_daily_gacha: row && row.auto_daily_gacha === 1 ? 1 : 0,
    auto_daily_gacha_mode: mode,
    auto_janken_fate: row && row.auto_janken_fate === 1 ? 1 : 0,
    auto_janken_fate_with_bet: row && row.auto_janken_fate_with_bet === 1 ? 1 : 0,
  };
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

exports.api = {};

exports.api.getPreference = async (req, res) => {
  try {
    const userId = get(req, "profile.userId");
    if (!userId) return res.status(401).json({ error: "unauthenticated" });

    const [preference, entitlements, gachaContext] = await Promise.all([
      loadPreference(userId),
      loadEntitlements(userId),
      loadGachaContext(userId),
    ]);
    return res.json({ ...preference, entitlements, gacha_context: gachaContext });
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
    if (Object.keys(update).length === 0 && modeUpdate === undefined) {
      const [preference, entitlements, gachaContext] = await Promise.all([
        loadPreference(userId),
        loadEntitlements(userId),
        loadGachaContext(userId),
      ]);
      return res.json({ ...preference, entitlements, gacha_context: gachaContext });
    }

    const entitlements = await loadEntitlements(userId);
    for (const flag of Object.keys(update)) {
      if (update[flag] === 1 && !entitlements[FLAG_EFFECT[flag]]) {
        return res.status(403).json({ error: "entitlement_missing", field: flag });
      }
    }

    await mysql.raw(
      `INSERT INTO user_auto_preference
        (user_id, auto_daily_gacha, auto_daily_gacha_mode, auto_janken_fate, auto_janken_fate_with_bet)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         auto_daily_gacha = COALESCE(?, auto_daily_gacha),
         auto_daily_gacha_mode = COALESCE(?, auto_daily_gacha_mode),
         auto_janken_fate = COALESCE(?, auto_janken_fate),
         auto_janken_fate_with_bet = COALESCE(?, auto_janken_fate_with_bet)`,
      [
        userId,
        update.auto_daily_gacha === undefined ? 0 : update.auto_daily_gacha,
        modeUpdate === undefined ? "normal" : modeUpdate,
        update.auto_janken_fate === undefined ? 0 : update.auto_janken_fate,
        update.auto_janken_fate_with_bet === undefined ? 0 : update.auto_janken_fate_with_bet,
        update.auto_daily_gacha === undefined ? null : update.auto_daily_gacha,
        modeUpdate === undefined ? null : modeUpdate,
        update.auto_janken_fate === undefined ? null : update.auto_janken_fate,
        update.auto_janken_fate_with_bet === undefined ? null : update.auto_janken_fate_with_bet,
      ]
    );

    const [preference, gachaContext] = await Promise.all([
      loadPreference(userId),
      loadGachaContext(userId),
    ]);
    return res.json({ ...preference, entitlements, gacha_context: gachaContext });
  } catch (err) {
    DefaultLogger.error(`auto-preference.put failed: ${err && err.message}`);
    return res.status(500).json({ error: "internal_error" });
  }
};

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
  const bubble = commonTemplate.genLinkBubble("自動設定", uri, "blue");
  await context.replyFlex("自動設定", bubble);
};

// Internal exports for testing
exports._internal = {
  loadEntitlements,
  loadPreference,
  loadGachaContext,
  parseJsonSafe,
  VALID_MODES,
};
