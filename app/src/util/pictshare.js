const axios = require("axios");
const FormData = require("form-data");

const PICTSHARE_URL = process.env.PICTSHARE_URL || "https://img.hanshino.dev";
const PICTSHARE_UPLOAD_CODE = process.env.PICTSHARE_UPLOAD_CODE || "";

/**
 * 上傳 buffer 圖片到 PictShare
 * @param {Buffer} imageBuffer
 * @returns {Promise<{url: string, hash: string, deleteUrl: string}>}
 */
async function uploadBuffer(imageBuffer) {
  const form = new FormData();
  form.append("file", imageBuffer, { filename: "image.png", contentType: "image/png" });
  if (PICTSHARE_UPLOAD_CODE) {
    form.append("uploadcode", PICTSHARE_UPLOAD_CODE);
  }

  const { data } = await axios.post(`${PICTSHARE_URL}/api/upload`, form, {
    headers: form.getHeaders(),
  });

  if (data.status !== "ok") {
    throw new Error(data.reason || "PictShare upload failed");
  }

  return {
    url: data.url,
    hash: data.hash,
    deleteUrl: data.delete_url,
  };
}

/**
 * 上傳 base64 圖片到 PictShare
 * @param {string} base64Image
 * @returns {Promise<{url: string, hash: string, deleteUrl: string}>}
 */
async function uploadBase64(base64Image) {
  const buffer = Buffer.from(base64Image, "base64");
  return uploadBuffer(buffer);
}

module.exports = { uploadBuffer, uploadBase64 };
