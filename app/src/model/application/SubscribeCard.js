const base = require("../base");

// 覆蓋規則：某卡種若被其他卡種持有中覆蓋，其 daily_ration / gacha_times 不發不計
// （倒數不受影響）。見 docs/mockups/me-plus-subscription.html 與 SubscriptionService.resolveActive。
// key: 被覆蓋者 → value: 覆蓋它的卡種清單（目前每個 key 最多一張，用陣列是為了未來擴充不必改型別）。
const SUPERSEDED_BY = Object.freeze({
  month: Object.freeze(["month_plus"]),
});

class SubscribeCard extends base {
  static SUPERSEDED_BY = SUPERSEDED_BY;

  // module.exports 是 `new SubscribeCard(...)` 的實例，static 欄位只能透過類別存取；
  // 呼叫端一律用 `SubscribeCard.SUPERSEDED_BY`（instance.SUPERSEDED_BY），故加此 getter
  // 轉發到 static 欄位。與 SubscribeUser.eligibleAutoMatchCardKeys 同一模式。
  get SUPERSEDED_BY() {
    return SubscribeCard.SUPERSEDED_BY;
  }

  constructor(props) {
    super(props);

    this.key = {
      month: "month",
      month_plus: "month_plus",
      season: "season",
    };
  }
}

module.exports = new SubscribeCard({
  table: "subscribe_card",
  fillable: [],
});
