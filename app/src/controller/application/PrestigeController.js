const PrestigeService = require("../../service/PrestigeService");

const ERROR_MESSAGES = {
  AWAKENED: "已達覺醒狀態，無法再轉生",
  NOT_LEVEL_100: "需先達到 Lv.100 才能轉生",
  ALREADY_ACTIVE: "已有進行中的試煉",
  ALREADY_PASSED: "該試煉已通過",
  INVALID_TRIAL: "試煉不存在",
  NO_ACTIVE_TRIAL: "目前沒有進行中的試煉",
  NO_PASSED_TRIAL_AVAILABLE: "請先通過一個試煉",
  NO_UNCONSUMED_TRIAL: "沒有未消費的已通過試煉",
  INVALID_BLESSING: "祝福不存在",
  ALREADY_HAS_BLESSING: "已擁有此祝福",
};

const STATUS_400_CODES = new Set([
  "AWAKENED",
  "NOT_LEVEL_100",
  "ALREADY_ACTIVE",
  "ALREADY_PASSED",
  "NO_ACTIVE_TRIAL",
  "NO_PASSED_TRIAL_AVAILABLE",
  "NO_UNCONSUMED_TRIAL",
  "ALREADY_HAS_BLESSING",
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
