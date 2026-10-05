jest.mock("../../../model/princess/guild", () => ({
  battle: { setFinishBattle: jest.fn() },
}));

const { battle: BattleModel } = require("../../../model/princess/guild");
const { reportFinish } = require("../battle");

describe("battle.reportFinish", () => {
  let context;

  beforeEach(() => {
    jest.resetAllMocks();
    BattleModel.setFinishBattle.mockResolvedValue();
    context = {
      event: { source: { groupId: "Gtest", userId: "Utest" } },
      state: { userDatas: { Utest: { displayName: "TestUser" } } },
      replyText: jest.fn().mockResolvedValue(),
    };
  });

  it("enqueues the unchanged reply after the DB completes and before the handler resolves", async () => {
    let finishDb;
    BattleModel.setFinishBattle.mockReturnValue(
      new Promise(resolve => {
        finishDb = resolve;
      })
    );

    const handler = reportFinish(context);
    expect(handler).toBeInstanceOf(Promise);
    expect(BattleModel.setFinishBattle).toHaveBeenCalledWith("Gtest", "Utest");
    expect(context.replyText).not.toHaveBeenCalled();

    finishDb();
    await handler;

    expect(context.replyText).toHaveBeenCalledTimes(1);
    expect(context.replyText).toHaveBeenCalledWith("恭喜TestUser今日已成為成功人士(出完三刀)！", {
      sender: { name: "戰隊秘書", iconUrl: "https://i.imgur.com/NuZZR7Q.jpg" },
    });
  });

  it("waits for the reply promise before resolving", async () => {
    let finishReply;
    context.replyText.mockReturnValue(
      new Promise(resolve => {
        finishReply = resolve;
      })
    );
    let resolved = false;
    const handler = reportFinish(context).then(() => {
      resolved = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(context.replyText).toHaveBeenCalledTimes(1);
    expect(resolved).toBe(false);

    finishReply();
    await handler;
    expect(resolved).toBe(true);
  });

  it("rejects the handler on DB failure without replying or detaching the rejection", async () => {
    const error = new Error("DB failed");
    BattleModel.setFinishBattle.mockRejectedValue(error);

    await expect(reportFinish(context)).rejects.toBe(error);
    expect(context.replyText).not.toHaveBeenCalled();
  });

  it("rejects the handler on reply failure", async () => {
    const error = new Error("Reply failed");
    context.replyText.mockRejectedValue(error);

    await expect(reportFinish(context)).rejects.toBe(error);
  });
});
