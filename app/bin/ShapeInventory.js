const { inventory: inventoryModel } = require("../src/model/application/Inventory");
const mysql = require("../src/util/mysql");
const { DefaultLogger } = require("../src/util/Logger");

const GOD_STONE_ITEM_ID = 999;

/**
 * 女神石帳本瘦身：把某個使用者的多筆 999 列壓成一列。
 *
 * 這支腳本目前沒有任何呼叫端（不在 crontab.config.js，也不是 package script），
 * 只會被人手動 `node bin/ShapeInventory.js` 跑起來。保留是因為它仍是一個有用的
 * 維運工具，但原本的寫法在有並發寫入時會吃掉別人的錢：
 *
 *   舊流程 = 交易「外」先 SUM 出 amount → 交易內 delete 全部 999 列 → insert 那個 amount
 *
 * 兩次讀取之間（掃描到實際刪除，可能隔了好幾個使用者的處理時間）只要有任何一筆
 * 女神石入帳 —— 公開市場收購單的取消退款、履約撥款、ATM 轉帳 —— 那一列會在 delete
 * 時被一起刪掉，卻不在稍早算好的 amount 裡，錢就這樣蒸發。
 *
 * 最小修正：交易外那次 SUM 只當作「誰需要處理」的候選名單，真正要寫回去的金額
 * 在同一筆交易內用 FOR UPDATE 重算。FOR UPDATE 會在 (userId, itemId) 這段索引範圍
 * 上鎖，並發的入帳要嘛在重算之前 commit（被算進去），要嘛卡住等我們 commit 之後
 * 才 append（成為壓縮後的新一列）。兩種情況都不會漏。
 */
async function main() {
  const result = await inventoryModel.knex
    .select("userId")
    .count({ count: "itemId" })
    .groupBy("userId")
    .sum({ amount: "itemAmount" })
    .where("itemId", GOD_STONE_ITEM_ID)
    .limit(100);

  // 只處理有多筆數據的用戶
  const processList = result.filter(item => item.count > 1);

  if (processList.length === 0) {
    DefaultLogger.info("沒有需要處理的用戶");
  }

  for (let i = 0; i < processList.length; i++) {
    const { userId, count } = processList[i];
    try {
      const amount = await mysql.transaction(async trx => {
        // 權威金額：交易內重算並上鎖，不能用掃描階段那個過期的 amount。
        const row = await trx(inventoryModel.table)
          .where({ userId, itemId: GOD_STONE_ITEM_ID })
          .sum({ amount: "itemAmount" })
          .forUpdate()
          .first();
        const current = Number((row && row.amount) || 0);

        await trx.delete().from(inventoryModel.table).where({ userId, itemId: GOD_STONE_ITEM_ID });
        await trx
          .insert({
            userId,
            itemId: GOD_STONE_ITEM_ID,
            itemAmount: current,
          })
          .into(inventoryModel.table);

        return current;
      });

      DefaultLogger.info(
        `處理用戶 ${userId} 女神石瘦身成功，共處理 ${count} 筆數據，女神石總數 ${amount}`
      );
    } catch (e) {
      DefaultLogger.error(e);
    }
  }
}

module.exports = main;

if (require.main === module) {
  main().then(() => process.exit());
}
