const base = require("../base");

class SponsorshipAudit extends base {
  /**
   * 該筆贊助是否已有指定 action 的 audit（用於補綁重送判斷：已綁過就不再寫第二筆）。
   * @param {Number} sponsorshipId
   * @param {"create"|"bind"} action
   * @param {import("knex").Knex.Transaction} [trx]
   */
  findByAction(sponsorshipId, action, trx) {
    return this.qb(trx).where({ sponsorship_id: sponsorshipId, action }).first();
  }

  listBySponsorship(sponsorshipId, trx) {
    return this.qb(trx).where({ sponsorship_id: sponsorshipId }).orderBy("created_at", "asc");
  }
}

module.exports = new SponsorshipAudit({
  table: "sponsorship_audit",
  fillable: ["sponsorship_id", "action", "operator_user_id", "payload_snapshot"],
});
