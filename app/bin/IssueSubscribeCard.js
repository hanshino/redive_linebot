const minimist = require("minimist");
const { isNumber } = require("lodash");
const SubscribeCardCouponService = require("../src/service/SubscribeCardCouponService");
const argv = minimist(process.argv.slice(2));
const allowKey = [...SubscribeCardCouponService.ALLOWED_KEYS];

async function main({ count = 1, key = "month" }) {
  if (!allowKey.includes(key)) {
    console.log(`key must be one of ${allowKey.join(", ")}`);
    return;
  }

  if (isNumber(count)) {
    count = parseInt(count) || 1;
  }

  if (count > SubscribeCardCouponService.MAX_ISSUE_COUNT) {
    console.log(`count must be less than ${SubscribeCardCouponService.MAX_ISSUE_COUNT}`);
    return;
  }

  console.log(`Generate ${count} ${key} coupon`);

  await SubscribeCardCouponService.issue({ cardKey: key, count, issuedBy: "system" });

  console.log("Done");
}

module.exports = main;

if (require.main === module) {
  main({
    count: argv.count,
    key: argv.key,
  }).then(() => process.exit(0));
}
