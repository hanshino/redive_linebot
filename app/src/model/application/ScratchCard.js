const base = require("../base");

class ScratchCard extends base {
  fetchAllTypes() {
    return this.knex.from("scratch_card_types").select("*");
  }
}

module.exports = new ScratchCard({
  table: "scratch_cards",
  fillable: ["scratch_card_type_id", "buyer_id", "reward", "is_used"],
});
