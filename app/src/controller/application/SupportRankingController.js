const SupportRankingService = require("../../service/SupportRankingService");
const UserModel = require("../../model/application/UserModel");

/**
 * `GET /api/support-rankings` — 公開榜單，不驗證身分。
 * 回應絕不含金額/卡種等機密欄位（見任務規格），只有 rank/display_name/picture_url/months。
 */
async function getRankings(req, res) {
  try {
    const result = await SupportRankingService.getPublicRanking();
    res.json(result);
  } catch (err) {
    console.error("[SupportRanking] getRankings", err);
    res.status(500).json({ error: "internal_error" });
  }
}

/**
 * `GET /api/support-rankings/me` — 需登入。userId 來自 req.profile（LINE platform_id），
 * 轉成 user.id 後查詢；查無使用者一律回未上榜的預設 shape。
 */
async function getMe(req, res) {
  try {
    const { userId } = req.profile;
    const id = await UserModel.getId(userId);
    if (!id) {
      return res.json({ has_support: false, hidden: false, months: 0, rank: null });
    }
    const status = await SupportRankingService.getMyStatus(id);
    res.json(status);
  } catch (err) {
    console.error("[SupportRanking] getMe", err);
    res.status(500).json({ error: "internal_error" });
  }
}

/**
 * `PUT /api/support-rankings/me` — 更新隱藏偏好。
 * body.hidden 必須是嚴格 boolean；無支持資格（months<=0）的使用者不得設定，回 403。
 */
async function putMe(req, res) {
  try {
    const { hidden } = req.body || {};
    if (typeof hidden !== "boolean") {
      return res.status(400).json({ error: "invalid_hidden" });
    }

    const { userId } = req.profile;
    const id = await UserModel.getId(userId);
    if (!id) {
      return res.status(403).json({ error: "no_support" });
    }

    const status = await SupportRankingService.getMyStatus(id);
    if (!status.has_support) {
      return res.status(403).json({ error: "no_support" });
    }

    await SupportRankingService.setHidden(id, hidden);
    const updated = await SupportRankingService.getMyStatus(id);
    res.json(updated);
  } catch (err) {
    console.error("[SupportRanking] putMe", err);
    res.status(500).json({ error: "internal_error" });
  }
}

module.exports = { getRankings, getMe, putMe };
