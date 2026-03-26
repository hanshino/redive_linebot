const mysql = require("../../util/mysql");
const USER_TABLE = "user";

/**
 * 取得用戶資料庫編號
 * @param {String} platformId 平台ID
 */
exports.getId = async platformId => {
  const rows = await mysql.select({ id: "id" }).from(USER_TABLE).where({ platform_id: platformId });
  return rows.length !== 0 ? rows[0].id : null;
};

/**
 * 取得平台ID
 * @param {Array<Number>} ids
 */
exports.getPlatformIds = ids => {
  return mysql
    .select({ userId: "platform_id", id: "id" })
    .whereIn("id", ids)
    .from(USER_TABLE);
};

/**
 * 更新用戶 LINE profile 資訊
 * @param {String} platformId 平台ID
 * @param {Object} profile LINE profile 物件
 */
exports.updateProfile = async (platformId, profile) => {
  const updates = {};
  if (profile.displayName) updates.display_name = profile.displayName;
  if (profile.pictureUrl) updates.picture_url = profile.pictureUrl;
  if (profile.statusMessage !== undefined) updates.status_message = profile.statusMessage;
  if (profile.language) updates.language = profile.language;

  if (Object.keys(updates).length === 0) return;
  return mysql(USER_TABLE).where({ platform_id: platformId }).update(updates);
};

/**
 * 確保用戶存在，不存在則自動建立
 * @param {String} platformId 平台ID
 * @param {String} platform 平台名稱 (預設 "line")
 * @returns {Promise<Number>} 用戶資料庫編號
 */
exports.ensureUser = async (platformId, platform = "line") => {
  const existing = await exports.getId(platformId);
  if (existing) return existing;

  const [id] = await mysql(USER_TABLE).insert({
    platform,
    platform_id: platformId,
    created_at: new Date(),
  });

  return id;
};
