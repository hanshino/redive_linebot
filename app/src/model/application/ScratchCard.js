const base = require("../base");

class ScratchCard extends base {
  async find(id) {
    return this.knex.from("scratch_card_types").where("id", id).first();
  }

  fetchAllTypes() {
    return this.knex.from("scratch_card_types").select("*");
  }

  async getCardInfo(id) {
    const rewards = await this.knex
      .groupBy("reward")
      .count({ count: "reward" })
      .select("reward")
      .where("scratch_card_type_id", id);

    const soldCount = await this.knex
      .count({ count: "reward" })
      .select("reward")
      .groupBy("reward")
      .where("scratch_card_type_id", id)
      .andWhereNot("buyer_id", null);

    rewards.forEach(reward => {
      const sold = soldCount.find(u => u.reward === reward.reward);
      reward.sold = sold ? sold.count : 0;
    });

    return rewards;
  }
}

module.exports = new ScratchCard({
  table: "scratch_cards",
  fillable: ["scratch_card_type_id", "buyer_id", "reward", "is_used"],
});
