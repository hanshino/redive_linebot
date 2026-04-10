const GachaBanner = require("../../model/princess/GachaBanner");

/**
 * 取得所有 banner 列表
 */
async function listBanners(req, res) {
  try {
    const banners = await GachaBanner.all({
      order: [{ column: "start_at", direction: "desc" }],
    });
    res.json(banners);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "取得 banner 列表失敗" });
  }
}

/**
 * 取得單一 banner 詳情（含角色）
 */
async function getBanner(req, res) {
  try {
    const { id } = req.params;
    const banner = await GachaBanner.findWithCharacters(parseInt(id));
    if (!banner) {
      return res.status(404).json({ message: "Banner 不存在" });
    }
    res.json(banner);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "取得 banner 失敗" });
  }
}

/**
 * 新增 banner
 * body: { name, type, rate_boost, cost, start_at, end_at, is_active, characterIds }
 */
async function createBanner(req, res) {
  try {
    const { characterIds = [], ...bannerData } = req.body;
    if (bannerData.start_at) bannerData.start_at = new Date(bannerData.start_at);
    if (bannerData.end_at) bannerData.end_at = new Date(bannerData.end_at);
    const id = await GachaBanner.create(bannerData);

    if (bannerData.type === "rate_up" && characterIds.length > 0) {
      await GachaBanner.setBannerCharacters(id, characterIds);
    }

    res.json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "新增 banner 失敗" });
  }
}

/**
 * 更新 banner
 * body: { name, type, rate_boost, cost, start_at, end_at, is_active, characterIds }
 */
async function updateBanner(req, res) {
  try {
    const { id } = req.params;
    const { characterIds, ...bannerData } = req.body;
    if (bannerData.start_at) bannerData.start_at = new Date(bannerData.start_at);
    if (bannerData.end_at) bannerData.end_at = new Date(bannerData.end_at);

    await GachaBanner.update(parseInt(id), bannerData);

    if (characterIds !== undefined) {
      await GachaBanner.setBannerCharacters(parseInt(id), characterIds);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "更新 banner 失敗" });
  }
}

/**
 * 刪除 banner（cascade 會自動刪除關聯角色）
 */
async function deleteBanner(req, res) {
  try {
    const { id } = req.params;
    await GachaBanner.delete(parseInt(id));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "刪除 banner 失敗" });
  }
}

module.exports = {
  listBanners,
  getBanner,
  createBanner,
  updateBanner,
  deleteBanner,
};
