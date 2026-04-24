const mysql = require("../../src/util/mysql");
const ChatUserData = require("../../src/model/application/ChatUserData");
const chatUserState = require("../../src/util/chatUserState");

const main = require("../../bin/TrialExpiryCheck");

function buildMockSequence({ matched, orphans, updateMock }) {
  // Recognizes builder intent from the chain method called:
  // - `.join()` first  → matched SELECT (first call)
  // - `.select()` after only `.where()` calls → orphans SELECT
  // - `.update()` after `.where()` → per-row update
  let matchedReturned = false;

  return () => {
    const qb = {
      join: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn(() => {
        if (!matchedReturned && qb.join.mock.calls.length > 0) {
          matchedReturned = true;
          return Promise.resolve(matched);
        }
        return Promise.resolve(orphans);
      }),
      update: updateMock,
    };
    return qb;
  };
}

describe("TrialExpiryCheck", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(ChatUserData, "upsert").mockResolvedValue(1);
    jest.spyOn(chatUserState, "invalidate").mockResolvedValue(1);
    mysql.raw = jest.fn(x => ({ __raw: x }));
  });

  it("marks matched active trials failed, clears chat_user_data, invalidates state", async () => {
    const matchedRows = [
      { id: 10, user_id: "Uold1", progress: 800 },
      { id: 11, user_id: "Uold2", progress: 1500 },
    ];
    const updateMock = jest.fn().mockResolvedValue(1);
    mysql.mockImplementation(buildMockSequence({ matched: matchedRows, orphans: [], updateMock }));

    await main();

    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", final_exp_progress: 800 })
    );
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", final_exp_progress: 1500 })
    );

    expect(ChatUserData.upsert).toHaveBeenCalledWith(
      "Uold1",
      expect.objectContaining({
        active_trial_id: null,
        active_trial_started_at: null,
        active_trial_exp_progress: 0,
      })
    );
    expect(ChatUserData.upsert).toHaveBeenCalledWith("Uold2", expect.any(Object));
    expect(chatUserState.invalidate).toHaveBeenCalledWith("Uold1");
    expect(chatUserState.invalidate).toHaveBeenCalledWith("Uold2");
  });

  it("expires orphan rows without touching chat_user_data", async () => {
    const orphanRows = [{ id: 99, user_id: "Uorphan" }];
    const updateMock = jest.fn().mockResolvedValue(1);
    mysql.mockImplementation(buildMockSequence({ matched: [], orphans: orphanRows, updateMock }));

    await main();

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", final_exp_progress: 0 })
    );
    expect(ChatUserData.upsert).not.toHaveBeenCalled();
    expect(chatUserState.invalidate).toHaveBeenCalledWith("Uorphan");
  });

  it("returns cleanly when there's nothing to expire", async () => {
    const updateMock = jest.fn().mockResolvedValue(1);
    mysql.mockImplementation(buildMockSequence({ matched: [], orphans: [], updateMock }));

    await expect(main()).resolves.toBeUndefined();
    expect(updateMock).not.toHaveBeenCalled();
    expect(ChatUserData.upsert).not.toHaveBeenCalled();
    expect(chatUserState.invalidate).not.toHaveBeenCalled();
  });

  it("swallows errors so cron doesn't crash", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mysql.mockImplementation(() => {
      throw new Error("db connection lost");
    });

    await expect(main()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
