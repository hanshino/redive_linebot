const PrestigeService = require("../../service/PrestigeService");

const ERROR_MESSAGES = {
  AWAKENED: "已達覺醒狀態，無法再轉生",
  NOT_LEVEL_100: "需先達到 Lv.100 才能轉生",
  ALREADY_ACTIVE: "已有進行中的試煉",
  ALREADY_PASSED: "該試煉已通過",
  PENDING_PRESTIGE: "請先完成轉生才能挑選下一道試煉",
  LEVEL_GATE: "需先升到 Lv.50 才能挑選試煉",
  INVALID_TRIAL: "試煉不存在",
  NO_ACTIVE_TRIAL: "目前沒有進行中的試煉",
  NO_PASSED_TRIAL: "請先通過一個試煉",
  INVALID_BLESSING: "祝福不存在",
  BLESSING_ALREADY_OWNED: "已擁有此祝福",
};

const STATUS_400_CODES = new Set([
  "AWAKENED",
  "NOT_LEVEL_100",
  "ALREADY_ACTIVE",
  "ALREADY_PASSED",
  "PENDING_PRESTIGE",
  "LEVEL_GATE",
  "NO_ACTIVE_TRIAL",
  "NO_PASSED_TRIAL",
  "BLESSING_ALREADY_OWNED",
]);

const STATUS_404_CODES = new Set(["INVALID_TRIAL", "INVALID_BLESSING"]);

function handleServiceError(err, res) {
  const code = err.code || "UNKNOWN";
  const message = ERROR_MESSAGES[code] || "系統暫時無法處理，請稍後再試";

  if (STATUS_400_CODES.has(code)) {
    return res.status(400).json({ code, message });
  }
  if (STATUS_404_CODES.has(code)) {
    return res.status(404).json({ code, message });
  }
  return res.status(500).json({ code, message });
}

exports.api = {};

exports.api.status = async (req, res) => {
  try {
    const { userId } = req.profile;
    const result = await PrestigeService.getPrestigeStatus(userId);
    return res.json(result);
  } catch (err) {
    return handleServiceError(err, res);
  }
};

exports.api.startTrial = async (req, res) => {
  try {
    const { trialId } = req.body || {};
    if (!Number.isInteger(trialId) || trialId <= 0) {
      return res.status(400).json({ code: "INVALID_BODY", message: "參數格式錯誤" });
    }
    const { userId } = req.profile;
    const result = await PrestigeService.startTrial(userId, trialId);
    return res.json(result);
  } catch (err) {
    return handleServiceError(err, res);
  }
};

exports.api.forfeitTrial = async (req, res) => {
  try {
    const { userId } = req.profile;
    const result = await PrestigeService.forfeitTrial(userId);
    return res.json(result);
  } catch (err) {
    return handleServiceError(err, res);
  }
};

exports.api.prestige = async (req, res) => {
  try {
    const { blessingId } = req.body || {};
    if (!Number.isInteger(blessingId) || blessingId <= 0) {
      return res.status(400).json({ code: "INVALID_BODY", message: "參數格式錯誤" });
    }
    const { userId } = req.profile;
    const result = await PrestigeService.prestige(userId, blessingId);
    return res.json(result);
  } catch (err) {
    return handleServiceError(err, res);
  }
};
