const WeatherService = require("../../service/ChatWeatherService");
const { DefaultLogger } = require("../../util/Logger");

exports.showToday = async context => {
  const { userId } = context.event.source;
  if (!userId) {
    return context.replyText("獲取失敗，無法辨識用戶");
  }
  const text = await WeatherService.describeToday(userId);
  return context.replyText(text);
};

// API: GET /api/me/chat-weather/today
exports.apiGetToday = async (req, res) => {
  try {
    const { userId } = req.profile;
    const status = await WeatherService.getTodayStatus(userId);
    res.json({
      date: status.date,
      weather: status.weather,
      protection: status.protection,
      god_stone_balance: status.godStoneBalance,
    });
  } catch (e) {
    DefaultLogger.error("[chat-weather/today]", e);
    res.status(500).json({ error: "internal_error" });
  }
};

const PURCHASE_MESSAGES = {
  DISABLED: "今日無法購買防護",
  NO_PROTECTION: "今日天氣沒有可購買的防護",
  ALREADY_PROTECTED: "你今天已經購買防護了",
  INSUFFICIENT_STONE: "女神石不足",
};

// API: POST /api/me/chat-weather/protection/purchase
exports.apiPurchase = async (req, res) => {
  try {
    const { userId } = req.profile;
    const result = await WeatherService.purchaseTodayProtection(userId);
    if (result.ok) {
      return res.json({ ok: true, protection: result.protection });
    }
    return res.status(400).json({
      code: result.code,
      message: PURCHASE_MESSAGES[result.code] || "購買失敗",
    });
  } catch (e) {
    DefaultLogger.error("[chat-weather/purchase]", e);
    res.status(500).json({ error: "internal_error" });
  }
};
