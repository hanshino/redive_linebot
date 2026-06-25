const moment = require("moment");

const TPE_OFFSET_MIN = 480;

exports.toUtc8Date = input => moment(input).utcOffset(TPE_OFFSET_MIN).format("YYYY-MM-DD");

exports.todayUtc8 = () => moment().utcOffset(TPE_OFFSET_MIN).format("YYYY-MM-DD");

exports.yesterdayUtc8 = () =>
  moment().utcOffset(TPE_OFFSET_MIN).subtract(1, "day").format("YYYY-MM-DD");

// N days before today on the UTC+8 calendar, "YYYY-MM-DD". daysAgoUtc8(0) === todayUtc8().
exports.daysAgoUtc8 = n =>
  moment().utcOffset(TPE_OFFSET_MIN).subtract(n, "day").format("YYYY-MM-DD");
