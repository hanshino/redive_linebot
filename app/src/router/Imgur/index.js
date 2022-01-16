const router = require("express").Router();
const { ImgurClient } = require("imgur");
const i18n = require("../../util/i18n");
const get = require("lodash/get");
const client = new ImgurClient({
  clientId: process.env.IMGUR_CLIENT_ID,
});

router.post("/image", async (req, res) => {
  try {
    const { image } = req.body;
    const data = await client.upload({
      image,
      type: "base64",
    });
    res.json({
      success: true,
      link: get(data, "0.data.link"),
    });
  } catch (e) {
    res.status(400).json({
      error: i18n.__("api.error.imgur.uploadBase64"),
      message: e.message,
    });
  }
});

module.exports = router;
