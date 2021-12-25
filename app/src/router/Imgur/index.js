const router = require("express").Router();
const imgur = require("imgur");
const i18n = require("../../util/i18n");

imgur.setClientId(process.env.IMGUR_CLIENT_ID);

router.post("/image", async (req, res) => {
  try {
    const { image } = req.body;
    const data = await imgur.uploadBase64(image);
    res.json({
      success: true,
      link: data.link,
    });
  } catch (e) {
    res.status(400).json({
      error: i18n.__("api.error.imgur.uploadBase64"),
      message: e.message,
    });
  }
});

module.exports = router;