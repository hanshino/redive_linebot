const lotteryOrderModel = require("../src/model/application/LotteryOrder");
const lotteryModel = require("../src/model/application/Lottery");
const { inventory: inventoryModel } = require("../src/model/application/Inventory");
const { CustomLogger } = require("../src/util/Logger");
const { get, intersection } = require("lodash");
const config = require("config");

// 固定盤點尚未兌換的彩券出來兌換
async function main() {
  const perPrice = config.get("lottery.price");
  const lotteryRate = 1 - config.get("lottery.maintain_tax");
  const orders = await lotteryOrderModel.all({
    filter: {
      status: lotteryOrderModel.status.initial,
    },
    limit: 200,
  });

  if (orders.length === 0) {
    CustomLogger.info("沒有需要處理的彩券");
    return;
  }

  // 取第一筆的樂透編號
  const lotteryMainId = get(orders, "0.lottery_main_id");
  const lottery = await lotteryModel.find(lotteryMainId);

  if (!lottery) {
    CustomLogger.warn("取得樂透資訊異常");
    return;
  }

  const lotteryResult = get(lottery, "result").split(",");
  const { carryover_money } = lottery;
  const { count = 0 } = await lotteryOrderModel.countByLottery(lotteryMainId);
  // 累計獎金為：購買人數 * 單價 * 營業用途稅率 + 前期累計獎金
  const totalCarryOver = Math.round(count * perPrice * lotteryRate + carryover_money);
  const updateInfo = [];
  const dispatchInfo = [];
  const noneRewardIds = [];

  orders.forEach(order => {
    const orderContent = get(order, "content").split(",");
    const intersectCount = intersection(lotteryResult, orderContent).length;

    // 有異常單子的話先跳過不處理
    if (order.lottery_main_id !== lotteryMainId) return;

    const pushToInfo = ({ reward, result, userId, orderId }) => {
      updateInfo.push({
        orderId,
        result,
      });
      dispatchInfo.push({
        reward,
        userId,
        result,
      });
    };

    const { user_id: userId, id: orderId } = order;
    let reward = 0;
    let result = null;

    switch (intersectCount) {
      case 5:
        // 頭獎
        reward = totalCarryOver;
        result = lotteryOrderModel.result.first;
        break;
      case 4:
        // 二獎
        reward = Math.floor(totalCarryOver / 6);
        result = lotteryOrderModel.result.second;
        break;
      case 3:
        // 三獎
        reward = 50000;
        result = lotteryOrderModel.result.third;
        break;
      case 2:
        // 四獎
        reward = 10000;
        result = lotteryOrderModel.result.fourth;
        break;
      default:
        noneRewardIds.push(orderId);
        return;
    }

    pushToInfo({
      result,
      userId,
      orderId,
      reward,
    });
  });

  const trx = await lotteryOrderModel.transaction();
  inventoryModel.setTransaction(trx);
  try {
    const lotteryOrderPromise = updateInfo.map(info =>
      lotteryOrderModel.update(info.orderId, {
        status: lotteryOrderModel.status.exchanged,
        result: info.result,
      })
    );
    const noneRewardPromise = lotteryOrderModel.makeItExchanged(noneRewardIds);

    const insertData = dispatchInfo.map(info => ({
      userId: info.userId,
      itemId: 999,
      itemAmount: info.reward,
      note: `樂透:${info.result}`,
    }));
    const inventoryPromise =
      insertData.length !== 0 ? inventoryModel.insert(insertData) : Promise.resolve;

    await Promise.all([lotteryOrderPromise, inventoryPromise, noneRewardPromise]);

    trx.commit();
  } catch (e) {
    console.error(e);
    CustomLogger.error(e);
    trx.rollback();
  }
}

module.exports = main;

if (require.main === module) {
  main().then(() => process.exit());
}
