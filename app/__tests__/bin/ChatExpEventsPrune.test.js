const mysql = require("../../src/util/mysql");

const main = require("../../bin/ChatExpEventsPrune");

function buildMockChain({ delMock }) {
  return () => {
    const qb = {
      where: jest.fn().mockReturnThis(),
      del: delMock,
    };
    return qb;
  };
}

describe("ChatExpEventsPrune", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mysql.raw = jest.fn(x => ({ __raw: x }));
  });

  it("issues a single 30-day retention DELETE on chat_exp_events", async () => {
    const tableSpy = jest.fn();
    const delMock = jest.fn().mockResolvedValue(42);
    mysql.mockImplementation(table => {
      tableSpy(table);
      return buildMockChain({ delMock })();
    });

    await main();

    expect(tableSpy).toHaveBeenCalledWith("chat_exp_events");
    expect(mysql.raw).toHaveBeenCalledWith(expect.stringMatching(/INTERVAL 30 DAY/));
    expect(delMock).toHaveBeenCalledTimes(1);
  });

  it("returns cleanly when there's nothing to prune", async () => {
    const delMock = jest.fn().mockResolvedValue(0);
    mysql.mockImplementation(buildMockChain({ delMock }));
    await expect(main()).resolves.toBeUndefined();
    expect(delMock).toHaveBeenCalledTimes(1);
  });

  it("swallows errors so cron doesn't crash the worker", async () => {
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
