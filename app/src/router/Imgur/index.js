const router = require("express").Router();
const i18n = require("../../util/i18n");
const pictshare = require("../../util/pictshare");

router.post("/images", async (req, res) => {
  try {
    const { image } = req.body;
    const result = await pictshare.uploadBase64(image);
    res.json({
      success: true,
      link: result.url,
    });
  } catch (e) {
    res.status(400).json({
      error: i18n.__("api.error.imgur.uploadBase64"),
      message: e.message,
    });
  }
});

module.exports = router;
