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

  async fetchRandomCards(id, count) {
    const cards = await this.knex
      .where("scratch_card_type_id", id)
      .andWhere("buyer_id", null)
      .andWhere("is_used", false)
      .orderByRaw("RAND()")
      .limit(count);

    return cards;
  }

  async fetchMyCards(userId, options = {}) {
    const query = this.knex
      .select({
        id: "scratch_cards.id",
        reward: "scratch_cards.reward",
        is_used: "scratch_cards.is_used",
        price: "scratch_card_types.price",
        name: "scratch_card_types.name",
      })
      .from("scratch_cards")
      .where("buyer_id", userId)
      .join("scratch_card_types", "scratch_card_types.id", "scratch_cards.scratch_card_type_id")
      .orderBy("is_used", "desc");

    if (options.limit) {
      query.limit(options.limit);
    }

    if (options.offset) {
      query.offset(options.offset);
    }

    return await query;
  }

  async fetchMyUnusedCards(userId) {
    return await this.knex
      .from("scratch_cards")
      .where("buyer_id", userId)
      .andWhere("is_used", false);
  }
}

module.exports = new ScratchCard({
  table: "scratch_cards",
  fillable: ["scratch_card_type_id", "buyer_id", "reward", "is_used"],
});
