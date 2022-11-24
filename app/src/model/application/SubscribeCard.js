const base = require("../base");

class SubscribeCard extends base {
  constructor(props) {
    super(props);

    this.key = {
      month: "month",
      season: "season",
    };
  }
}

module.exports = new SubscribeCard({
  table: "subscribe_card",
  fillable: [],
});
