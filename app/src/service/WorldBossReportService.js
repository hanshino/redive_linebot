// M8 stub — implementation owned by WorldBossReportService (Milestone M8).
// This file exists so Jest's module resolver can locate it; the real implementation
// is delivered in M8. Tests mock this module via jest.mock("../WorldBossReportService").

/**
 * Mark the world boss report as unread for a player so it surfaces on next reply/LIFF pull.
 * NO LINE Push API — delivery is pull-based only.
 * @param {string} platformId
 * @returns {Promise<void>}
 */
exports.setUnread = async platformId => {
  throw new Error(
    `WorldBossReportService.setUnread not yet implemented (M8); platformId=${platformId}`
  );
};
