const Base = require("../base");

const TABLE = "user_weather_protections";
const fillable = [
  "user_id",
  "weather_date",
  "weather_key",
  "protection_type",
  "protection_name",
  "stone_cost",
  "purchased_at",
];

class UserWeatherProtection extends Base {}

const model = new UserWeatherProtection({ table: TABLE, fillable });

exports.model = model;

exports.findByUserDate = (userId, date) =>
  model.first({ filter: { user_id: userId, weather_date: date } });

exports.createProtection = (payload, trx) => model.create(payload, trx);
