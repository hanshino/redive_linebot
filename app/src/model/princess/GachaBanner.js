const Base = require("../base");

class GachaBanner extends Base {
  constructor() {
    super({
      table: "gacha_banner",
      fillable: ["name", "type", "rate_boost", "cost", "start_at", "end_at", "is_active"],
    });
  }

  /**
   * 查詢當前有效的 banner（時間內且啟用中）
   * @param {Object} options
   * @param {String} options.type 活動類型 rate_up | europe
   * @returns {Promise<Array>}
   */
  async getActiveBanners(options = {}) {
    const now = new Date();
    let query = this.knex
      .where("is_active", true)
      .where("start_at", "<=", now)
      .where("end_at", ">=", now);

    if (options.type) {
      query = query.where("type", options.type);
    }

    return query.orderBy("start_at", "desc");
  }

  /**
   * 取得 banner 的關聯角色 ID 列表
   * @param {Number} bannerId
   * @returns {Promise<Array<Number>>}
   */
  async getBannerCharacterIds(bannerId) {
    const rows = await this.connection("gacha_banner_characters")
      .where("banner_id", bannerId)
      .select("character_id");
    return rows.map(r => r.character_id);
  }

  /**
   * 查詢有效 banner 並一次載入所有關聯角色（避免 N+1）
   * @param {Object} options
   * @param {String} options.type 活動類型 rate_up | europe
   * @returns {Promise<Array>} banners with characterIds attached
   */
  async getActiveBannersWithCharacters(options = {}) {
    const banners = await this.getActiveBanners(options);
    if (banners.length === 0) return [];

    const ids = banners.map(b => b.id);
    const chars = await this.connection("gacha_banner_characters")
      .whereIn("banner_id", ids)
      .select("banner_id", "character_id");

    const charMap = {};
    for (const c of chars) {
      (charMap[c.banner_id] ||= []).push(c.character_id);
    }
    return banners.map(b => ({ ...b, characterIds: charMap[b.id] || [] }));
  }

  /**
   * 設定 banner 的關聯角色（先刪後插，包在 transaction 中）
   * @param {Number} bannerId
   * @param {Array<Number>} characterIds
   */
  async setBannerCharacters(bannerId, characterIds) {
    const trx = await this.connection.transaction();
    try {
      await trx("gacha_banner_characters").where("banner_id", bannerId).del();
      if (characterIds.length > 0) {
        await trx("gacha_banner_characters").insert(
          characterIds.map(characterId => ({
            banner_id: bannerId,
            character_id: characterId,
          }))
        );
      }
      await trx.commit();
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  }

  /**
   * 取得 banner 詳情（含關聯角色）
   * @param {Number} id
   * @returns {Promise<Object|null>}
   */
  async findWithCharacters(id) {
    const banner = await this.find(id);
    if (!banner) return null;

    const characterIds = await this.getBannerCharacterIds(id);
    return { ...banner, characterIds };
  }
}

module.exports = new GachaBanner();
