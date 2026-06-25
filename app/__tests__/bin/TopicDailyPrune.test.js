const mysql = require("../../src/util/mysql");

const main = require("../../bin/TopicDailyPrune");

// NOTE: transform:{} in jest.config means jest.mock is NOT hoisted — the
// requires above must come before any jest.mock() calls that target them.
// mysql is already mocked globally in __tests__/setup.js.

function buildMockChain({ delMock }) {
  return () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      del: delMock,
    };
    return qb;
  };
}

describe("TopicDailyPrune", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("issues a DELETE on topic_daily with stat_date < 90-day UTC+8 cutoff", async () => {
    const tableSpy = jest.fn();
    const whereSpy = jest.fn().mockReturnThis();
    const delMock = jest.fn().mockResolvedValue(77);

    mysql.mockImplementation(table => {
      tableSpy(table);
      return { where: whereSpy, del: delMock };
    });

    await main();

    // Correct table
    expect(tableSpy).toHaveBeenCalledWith("topic_daily");

    // where called with column, operator, cutoff date
    expect(whereSpy).toHaveBeenCalledWith(
      "stat_date",
      "<",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
    );

    // Cutoff is exactly 90 days before today (UTC+8)
    const cutoffArg = whereSpy.mock.calls[0][2];
    const cutoffDate = new Date(cutoffArg + "T00:00:00+08:00");
    const expectedCutoff = new Date();
    expectedCutoff.setUTCHours(expectedCutoff.getUTCHours() + 8); // shift to UTC+8
    expectedCutoff.setDate(expectedCutoff.getDate() - 90);
    // Allow ±1 day tolerance for edge-of-day races
    const diffMs = Math.abs(cutoffDate.getTime() - expectedCutoff.getTime());
    expect(diffMs).toBeLessThan(2 * 24 * 60 * 60 * 1000);

    expect(delMock).toHaveBeenCalledTimes(1);
  });

  it("returns cleanly when there is nothing to prune", async () => {
    const delMock = jest.fn().mockResolvedValue(0);
    mysql.mockImplementation(buildMockChain({ delMock }));
    await expect(main()).resolves.toBeUndefined();
    expect(delMock).toHaveBeenCalledTimes(1);
  });

  it("swallows errors so the cron worker does not crash", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mysql.mockImplementation(() => {
      throw new Error("db connection lost");
    });

    await expect(main()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("swallows errors raised inside del()", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const delMock = jest.fn().mockRejectedValue(new Error("lock wait timeout"));
    mysql.mockImplementation(buildMockChain({ delMock }));

    await expect(main()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
