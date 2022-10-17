const { inventory: inventoryModel } = require("../src/model/application/Inventory");
const { DefaultLogger } = require("../src/util/Logger");

async function main() {
  const result = await inventoryModel.knex
    .select("userId")
    .count({ count: "itemId" })
    .groupBy("userId")
    .sum({ amount: "itemAmount" })
    .where("itemId", 999)
    .limit(100);

  // 只處理有多筆數據的用戶
  const processList = result.filter(item => item.count > 1);

  if (processList.length === 0) {
    DefaultLogger.info("沒有需要處理的用戶");
  }

  for (let i = 0; i < processList.length; i++) {
    const trx = await inventoryModel.transaction();
    try {
      const { userId, amount, count } = processList[i];

      await trx.delete().from(inventoryModel.table).where({ userId, itemId: 999 });
      await trx
        .insert({
          userId,
          itemId: 999,
          itemAmount: amount,
        })
        .into(inventoryModel.table);

      DefaultLogger.info(
        `處理用戶 ${userId} 女神石瘦身成功，共處理 ${count} 筆數據，女神石總數 ${amount}`
      );

      trx.commit();
    } catch (e) {
      console.log(e);
      trx.rollback();
    }
  }
}

module.exports = main;

if (require.main === module) {
  main().then(() => process.exit());
}
