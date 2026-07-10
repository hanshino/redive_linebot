"use strict";

const config = require("config");
const moment = require("moment");
const mysql = require("../util/mysql");
const { todayUtc8 } = require("../util/date");
const ChatDailyWeather = require("../model/application/ChatDailyWeather");
const UserWeatherProtection = require("../model/application/UserWeatherProtection");
const { inventory } = require("../model/application/Inventory");
const gacha = require("../model/princess/gacha");
const { pickWeather } = require("./chatXp/weatherEffects");
const { DefaultLogger } = require("../util/Logger");

function cfg() {
  return config.get("chat_level.dailyWeather");
}

function normalize(row) {
  if (!row) return null;
  if (typeof row.effects === "string") row.effects = JSON.parse(row.effects);
  return row;
}

async function generateWeatherForDate(date) {
  const c = cfg();
  const prevDate = moment(date, "YYYY-MM-DD").subtract(1, "day").format("YYYY-MM-DD");
  const prev = await ChatDailyWeather.findByDate(prevDate);
  const key = pickWeather(c.pool, c.weights, prev && prev.weather_key);
  const def = c.pool[key];
  const isDebuff = def.category === "debuff";
  await ChatDailyWeather.insertIfAbsent({
    date,
    weather_key: key,
    category: def.category,
    name: def.name,
    flavor_text: def.flavorText,
    effects: def.effects,
    protection_type: isDebuff ? def.protectionType : null,
    protection_name: isDebuff ? def.protectionName : null,
    protection_cost: isDebuff ? (def.protectionCost ?? c.defaultProtectionCost) : null,
    generated_at: new Date(),
  });
  DefaultLogger.info(`[weather] ${date} -> ${key} (${def.category})`);
}

async function getWeatherForDate(date) {
  if (!cfg().enabled) return null;
  let row = await ChatDailyWeather.findByDate(date);
  if (!row) {
    await generateWeatherForDate(date);
    row = await ChatDailyWeather.findByDate(date);
  }
  return normalize(row);
}

function getUserProtection(userId, date) {
  return UserWeatherProtection.findByUserDate(userId, date);
}

async function getTodayStatus(userId) {
  const date = todayUtc8();
  const weather = await getWeatherForDate(date);
  const [protection, godStoneBalance] = await Promise.all([
    getUserProtection(userId, date),
    gacha.getUserGodStoneCount(userId),
  ]);
  return {
    date,
    weather,
    protection: protection || null,
    godStoneBalance: Number(godStoneBalance),
  };
}

function isDuplicate(e) {
  return e?.code === "ER_DUP_ENTRY";
}

async function purchaseTodayProtection(userId, now = Date.now()) {
  const c = cfg();
  if (!c.enabled || !c.purchaseEnabled) return { ok: false, code: "DISABLED" };

  const date = todayUtc8();
  const weather = await getWeatherForDate(date);
  if (!weather || !weather.protection_type) return { ok: false, code: "NO_PROTECTION" };

  const existing = await getUserProtection(userId, date);
  if (existing) return { ok: false, code: "ALREADY_PROTECTED", protection: existing };

  const cost = weather.protection_cost;
  const balance = Number(await gacha.getUserGodStoneCount(userId));
  if (balance < cost) return { ok: false, code: "INSUFFICIENT_STONE", balance, cost };

  try {
    await mysql.transaction(async trx => {
      await inventory.decreaseGodStone({
        userId,
        amount: cost,
        note: `weather_protection:${weather.weather_key}`,
        trx,
      });
      await UserWeatherProtection.createProtection(
        {
          user_id: userId,
          weather_date: date,
          weather_key: weather.weather_key,
          protection_type: weather.protection_type,
          protection_name: weather.protection_name,
          stone_cost: cost,
          purchased_at: new Date(now),
        },
        trx
      );
    });
  } catch (e) {
    if (isDuplicate(e)) return { ok: false, code: "ALREADY_PROTECTED" };
    throw e;
  }

  const protection = await getUserProtection(userId, date);
  return { ok: true, protection };
}

module.exports = {
  getWeatherForDate,
  generateWeatherForDate,
  getUserProtection,
  getTodayStatus,
  purchaseTodayProtection,
};
