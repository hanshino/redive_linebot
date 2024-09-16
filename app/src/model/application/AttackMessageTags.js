const base = require("../base");

class AttackMessageTags extends base {
  /**
   * Get all tags
   * @returns {Promise<string[]>}
   */
  async getTags() {
    return this.knex.distinct("tag").then(result => result.map(item => item.tag));
  }
}

module.exports = new AttackMessageTags({
  table: "attack_message_has_tags",
});
