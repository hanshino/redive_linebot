// M7 stub — implementation owned by WorldBossSettlementService (Milestone M7).
// This file exists so Jest's module resolver can locate it; the real implementation
// is delivered in M7. Tests mock this module via jest.mock("../WorldBossSettlementService").

/**
 * Settle a world boss event: compute & grant rewards to all participants.
 * Idempotent — guards on settled_at != null via WorldBossEvent.markSettled.
 * @param {Number} eventId
 * @returns {Promise<void>}
 */
exports.settleEvent = async eventId => {
  throw new Error(
    `WorldBossSettlementService.settleEvent not yet implemented (M7); eventId=${eventId}`
  );
};
