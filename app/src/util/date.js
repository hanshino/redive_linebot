const moment = require("moment");

const TPE_OFFSET_MIN = 480;

exports.todayUtc8 = () => moment().utcOffset(TPE_OFFSET_MIN).format("YYYY-MM-DD");

exports.yesterdayUtc8 = () =>
  moment().utcOffset(TPE_OFFSET_MIN).subtract(1, "day").format("YYYY-MM-DD");
