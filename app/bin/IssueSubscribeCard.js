const uuid = require("uuid-random");
const SubscribeCardCoupon = require("../src/model/application/SubscribeCardCoupon");
const minimist = require("minimist");
const { isNumber } = require("lodash");
const argv = minimist(process.argv.slice(2));
const allowKey = ["month", "season"];

async function main({ count = 1, key = "month" }) {
  if (!allowKey.includes(key)) {
    console.log(`key must be one of ${allowKey.join(", ")}`);
    return;
  }

  if (isNumber(count)) {
    count = parseInt(count) || 1;
  }

  if (count > 100) {
    console.log("count must be less than 100");
    return;
  }

  console.log(`Generate ${count} ${key} coupon`);

  const coupons = Array.from({ length: count }).map(() => ({
    subscribe_card_key: key,
    serial_number: uuid(),
    status: SubscribeCardCoupon.status.unused,
    issued_by: "system",
  }));

  await SubscribeCardCoupon.insert(coupons);

  console.log("Done");
}

module.exports = main;

if (require.main === module) {
  main({
    count: argv.count,
    key: argv.key,
  }).then(() => process.exit(0));
}
