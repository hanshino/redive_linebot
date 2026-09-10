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
  return mysql.select({ userId: "platform_id", id: "id" }).whereIn("id", ids).from(USER_TABLE);
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
 * 取得用戶顯示資訊
 * @param {String} platformId 平台ID
 * @returns {Promise<{displayName: string, pictureUrl: string}|null>}
 */
exports.getProfile = async platformId => {
  const rows = await mysql
    .select({ display_name: "display_name", picture_url: "picture_url" })
    .from(USER_TABLE)
    .where({ platform_id: platformId });

  if (rows.length === 0) return null;
  const { display_name, picture_url } = rows[0];
  if (!display_name) return null;
  return { displayName: display_name, pictureUrl: picture_url || null };
};

/**
 * 批次取顯示名稱，回 Map<platformId, displayName|null>。
 *
 * 存在的理由只有一個：讓「一批 user id → 一批名字」是一次查詢。呼叫端拿到 Map 之後就地
 * 查表，不要在迴圈裡呼叫 getProfile。查無或空字串一律 null，讓呼叫端只有一種缺值型態。
 */
exports.getDisplayNames = async platformIds => {
  const ids = [...new Set(platformIds.filter(id => typeof id === "string" && id))];
  if (!ids.length) return new Map();
  const rows = await mysql(USER_TABLE)
    .whereIn("platform_id", ids)
    .select("platform_id", "display_name");
  return new Map(rows.map(row => [row.platform_id, row.display_name?.trim() || null]));
};

/**
 * 依資料庫編號查找使用者（sponsorship 後台用：user_id 是 int PK，不是 platformId）。
 * @param {Number} id
 * @returns {Promise<?Object>} 原始資料列（含 id / platform_id / display_name）
 */
exports.findById = async id => {
  return mysql(USER_TABLE).where({ id }).first();
};

/**
 * 玩家搜尋：platform_id 精確比對 OR display_name 模糊比對，供贊助後台選人用。
 * 手動跳脫 LIKE 萬用字元，避免呼叫端傳入 `%`/`_` 造成非預期的大量比對。
 *
 * 回傳含 `pictureUrl`：前端原本要為每個搜尋結果各打一次 `/api/profile/:userId`
 * 補頭像（N+1），這裡直接在同一次查詢帶出即可（見
 * docs/plans/2026-09-09-sponsorship-admin-v1-api.md §1）。
 * @param {String} q
 * @param {Number} [limit]
 * @returns {Promise<Array<{id: Number, userId: String, displayName: ?String, pictureUrl: ?String}>>}
 */
exports.search = async (q, limit = 20) => {
  const query = typeof q === "string" ? q.trim().slice(0, 50) : "";
  if (!query) return [];
  const likeSafe = query.replace(/[\\%_]/g, ch => `\\${ch}`);

  const rows = await mysql(USER_TABLE)
    .where("platform_id", query)
    .orWhere("display_name", "like", `%${likeSafe}%`)
    .select("id", "platform_id", "display_name", "picture_url")
    .limit(limit);

  return rows.map(row => ({
    id: row.id,
    userId: row.platform_id,
    displayName: row.display_name?.trim() || null,
    pictureUrl: row.picture_url || null,
  }));
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
