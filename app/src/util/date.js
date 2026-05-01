const moment = require("moment");

const TPE_OFFSET_MIN = 480;

exports.todayUtc8 = () => moment().utcOffset(TPE_OFFSET_MIN).format("YYYY-MM-DD");
