const Base = require("../base");
const mysql = require("../../util/mysql");

const TABLE = "chat_daily_weather";
const fillable = [
  "date",
  "weather_key",
  "category",
  "name",
  "flavor_text",
  "effects",
  "protection_type",
  "protection_name",
  "protection_cost",
  "generated_at",
];

class ChatDailyWeather extends Base {}

const model = new ChatDailyWeather({ table: TABLE, fillable });

exports.model = model;

exports.findByDate = date => model.first({ filter: { date } });

/**
 * Atomic lazy-generation guard. `date` is the PK, so INSERT IGNORE lets the bot
 * and worker processes race a first-access generation without creating two rows
 * — callers re-SELECT via findByDate and use whichever row won.
 */
exports.insertIfAbsent = async payload => {
  const effects =
    typeof payload.effects === "string" ? payload.effects : JSON.stringify(payload.effects);
  return mysql.raw(
    `INSERT IGNORE INTO ${TABLE}
       (date, weather_key, category, name, flavor_text, effects,
        protection_type, protection_name, protection_cost, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.date,
      payload.weather_key,
      payload.category,
      payload.name,
      payload.flavor_text,
      effects,
      payload.protection_type ?? null,
      payload.protection_name ?? null,
      payload.protection_cost ?? null,
      payload.generated_at,
    ]
  );
};
