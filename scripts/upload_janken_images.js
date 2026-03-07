#!/usr/bin/env node
/**
 * Upload janken images to Imgur and output the URLs.
 * Usage: node scripts/upload_janken_images.js
 */

const appDir = require("path").resolve(__dirname, "../app");
require(require("path").join(appDir, "node_modules/dotenv")).config({
  path: require("path").resolve(__dirname, "../.env"),
});

const { ImgurClient } = require(require("path").join(appDir, "node_modules/imgur"));
const fs = require("fs");
const path = require("path");

const client = new ImgurClient({
  clientId: process.env.IMGUR_CLIENT_ID,
});

const ASSETS_DIR = path.resolve(__dirname, "../app/assets/janken");

async function uploadImage(filePath) {
  const base64 = fs.readFileSync(filePath).toString("base64");
  const response = await client.upload({
    image: base64,
    type: "base64",
    title: path.basename(filePath, ".png"),
  });
  console.log("    Response keys:", Object.keys(response));
  console.log("    Response data keys:", response.data ? Object.keys(response.data) : "no data");
  console.log("    typeof response.data:", typeof response.data);
  if (typeof response.data === "object") {
    console.log("    data.link:", response.data.link);
    console.log("    data.id:", response.data.id);
  }
  return response.data?.link;
}

async function main() {
  const files = fs.readdirSync(ASSETS_DIR).filter(f => f.endsWith(".png")).sort();

  console.log(`Uploading ${files.length} images from ${ASSETS_DIR}\n`);

  const results = {};
  for (const file of files) {
    const filePath = path.join(ASSETS_DIR, file);
    const name = path.basename(file, ".png");
    try {
      const link = await uploadImage(filePath);
      results[name] = link;
      console.log(`  ✓ ${name}: ${link}`);
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message}`);
    }
  }

  // Save results to a JSON file for reference
  const outputPath = path.join(ASSETS_DIR, "imgur_urls.json");
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nURLs saved to ${outputPath}`);
}

main().catch(console.error);
