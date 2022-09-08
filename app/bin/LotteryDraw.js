const lotteryModel = require("../src/model/application/Lottery");
const { CustomLogger } = require("../src/util/Logger");
const config = require("config");
const { sampleSize } = require("lodash");

async function main() {
  const max = config.get("lottery.max_number");
  const min = config.get("lottery.min_number");
  const allNumbers = Array.from({ length: max - min + 1 }, (_, i) => i + min);

  const lottery = await lotteryModel.first({
    filter: {
      status: lotteryModel.status.selling,
    },
  });

  if (!lottery) {
    CustomLogger.info("沒有需要開獎的活動");
    return;
  }

  const trx = await lotteryModel.transaction();
  try {
    const chosenNumbers = sampleSize(allNumbers, config.get("lottery.max_count")).sort(
      (a, b) => a - b
    );

    console.log(chosenNumbers, "準備開出這些數字");

    await lotteryModel.update(lottery.id, {
      result: chosenNumbers.join(","),
      status: lotteryModel.status.drawed,
    });

    trx.commit();
  } catch (e) {
    console.log(e);
    trx.rollback();
  }
}

module.exports = main;

if (require.main === module) {
  main().then(() => process.exit());
}
