const SigninService = require("../../service/SigninService");
const { DefaultLogger } = require("../../util/Logger");

// domain error code → HTTP status + 使用者訊息。
// 這張表就是 API 契約本身，service 只回 code，不知道 HTTP。
const ERRORS = {
  INVALID_DATE: { status: 400, message: "日期格式錯誤" },
  NOT_CURRENT_MONTH: { status: 400, message: "只能補簽當月的日期" },
  DATE_NOT_PAST: { status: 400, message: "只能補簽今天以前的日期" },
  INSUFFICIENT_STONES: { status: 400, message: "女神石不足" },
  ALREADY_SIGNED: { status: 409, message: "這天已經簽到過了" },
};

// API: GET /api/me/signins
exports.apiGetCalendar = async (req, res) => {
  try {
    const { userId } = req.profile;
    res.json(await SigninService.getCalendar(userId));
  } catch (e) {
    DefaultLogger.error("[me/signins]", e);
    res.status(500).json({ error: "internal_error" });
  }
};

// API: POST /api/me/signins/makeup
exports.apiMakeup = async (req, res) => {
  try {
    const { userId } = req.profile;
    const date = (req.body || {}).date;

    const result = await SigninService.makeup(userId, date);
    if (!result.ok) {
      const mapped = ERRORS[result.code] || { status: 400, message: "補簽失敗" };
      return res.status(mapped.status).json({ code: result.code, message: mapped.message });
    }

    // 成功回傳最新月曆，前端不必再打一次 GET。
    const payload = await SigninService.getCalendar(userId);
    res.json({ ...payload, ok: true, created: { date: result.date, cost: result.cost } });
  } catch (e) {
    DefaultLogger.error("[me/signins/makeup]", e);
    res.status(500).json({ error: "internal_error" });
  }
};
