const base = require("../base");

class Lottery extends base {
  constructor(props) {
    super(props);
    this.status = {
      selling: "selling",
      drawed: "drawed",
      closed: "closed",
    };
  }
}

module.exports = new Lottery({
  table: "lottery_main",
  fillable: ["status", "result", "carryover_money", "exchange_expired_at"],
});
