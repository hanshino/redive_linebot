const getUserProfileMock = jest.fn();
jest.mock("bottender", () => ({
  getClient: () => ({ getUserProfile: getUserProfileMock }),
}));
jest.mock("../../src/util/line", () => ({
  getGroupMemberProfile: jest.fn(),
}));
jest.mock("../../src/util/Logger", () => ({
  DefaultLogger: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));
jest.mock("../../src/util/mysql");
const mysql = require("../../src/util/mysql");
const lineUtil = require("../../src/util/line");
const {
  notifyUnlocks,
  renderTemplate,
  getDisplayName,
} = require("../../src/service/achievementNotifier");

describe("achievementNotifier", () => {
  describe("renderTemplate", () => {
    it("uses the with-reward default when notify_message is null and reward > 0", () => {
      const out = renderTemplate(
        { name: "夜貓子", icon: "🌙", reward_stones: 50, notify_message: null },
        "Alice"
      );
      expect(out).toBe("🎉 Alice 解鎖成就「🌙 夜貓子」！獲得 50 顆女神石");
    });

    it("uses the no-reward default when notify_message is null and reward is 0", () => {
      const out = renderTemplate(
        { name: "彩蛋", icon: "🥚", reward_stones: 0, notify_message: null },
        "Bob"
      );
      expect(out).toBe("🎉 Bob 解鎖成就「🥚 彩蛋」！");
    });

    it("substitutes placeholders in a custom notify_message", () => {
      const out = renderTemplate(
        {
          name: "測試",
          icon: "🧪",
          reward_stones: 10,
          notify_message: "{user} -> {name} ({icon}) +{reward}",
        },
        "Carol"
      );
      expect(out).toBe("Carol -> 測試 (🧪) +10");
    });

    it("replaces repeated placeholders globally", () => {
      const out = renderTemplate(
        {
          name: "重複",
          icon: "🔁",
          reward_stones: 1,
          notify_message: "{user} {user} {name} {name}",
        },
        "Dan"
      );
      expect(out).toBe("Dan Dan 重複 重複");
    });
  });

  describe("notifyUnlocks", () => {
    let context;

    beforeEach(() => {
      context = { replyText: jest.fn() };
      mysql.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ display_name: "Eve" }),
      });
    });

    it("does nothing when no achievement opts in", async () => {
      await notifyUnlocks(context, "user1", [
        { notify_on_unlock: false, name: "X", icon: "X", reward_stones: 0, notify_message: null },
      ]);
      expect(context.replyText).not.toHaveBeenCalled();
    });

    it("skips user lookup when list is empty", async () => {
      await notifyUnlocks(context, "user1", []);
      expect(context.replyText).not.toHaveBeenCalled();
      expect(mysql).not.toHaveBeenCalled();
    });

    it("replies once per opt-in achievement", async () => {
      await notifyUnlocks(context, "user1", [
        {
          notify_on_unlock: true,
          name: "A",
          icon: "🅰",
          reward_stones: 10,
          notify_message: null,
        },
        {
          notify_on_unlock: false,
          name: "B",
          icon: "🅱",
          reward_stones: 0,
          notify_message: null,
        },
        {
          notify_on_unlock: true,
          name: "C",
          icon: "🇨",
          reward_stones: 0,
          notify_message: null,
        },
      ]);
      expect(context.replyText).toHaveBeenCalledTimes(2);
      expect(context.replyText).toHaveBeenNthCalledWith(
        1,
        "🎉 Eve 解鎖成就「🅰 A」！獲得 10 顆女神石"
      );
      expect(context.replyText).toHaveBeenNthCalledWith(2, "🎉 Eve 解鎖成就「🇨 C」！");
    });

    it("uses fallback display name 玩家 when all lookups fail", async () => {
      mysql.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });
      lineUtil.getGroupMemberProfile.mockRejectedValue(new Error("no group"));
      getUserProfileMock.mockRejectedValue(new Error("not friends"));
      await notifyUnlocks(context, "missing-user", [
        {
          notify_on_unlock: true,
          name: "Z",
          icon: "🅉",
          reward_stones: 0,
          notify_message: null,
        },
      ]);
      expect(context.replyText).toHaveBeenCalledWith("🎉 玩家 解鎖成就「🅉 Z」！");
    });

    it("falls back to getUserProfile when DB row is missing", async () => {
      mysql.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });
      getUserProfileMock.mockResolvedValue({ displayName: "直通阿明" });
      await notifyUnlocks(context, "U1", [
        {
          notify_on_unlock: true,
          name: "Z",
          icon: "🅉",
          reward_stones: 0,
          notify_message: null,
        },
      ]);
      expect(context.replyText).toHaveBeenCalledWith("🎉 直通阿明 解鎖成就「🅉 Z」！");
    });

    it("swallows internal errors so the middleware chain never breaks", async () => {
      mysql.mockImplementation(() => {
        throw new Error("db down");
      });
      lineUtil.getGroupMemberProfile.mockRejectedValue(new Error("no group"));
      getUserProfileMock.mockRejectedValue(new Error("nope"));
      await expect(
        notifyUnlocks(context, "user1", [
          {
            notify_on_unlock: true,
            name: "A",
            icon: "🅰",
            reward_stones: 0,
            notify_message: null,
          },
        ])
      ).resolves.toBeUndefined();
    });
  });

  describe("getDisplayName fallback chain", () => {
    beforeEach(() => {
      jest.clearAllMocks();
      lineUtil.getGroupMemberProfile.mockReset();
      getUserProfileMock.mockReset();
    });

    it("DB hit short-circuits LINE API calls", async () => {
      mysql.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue({ display_name: "DB名" }),
      });
      const name = await getDisplayName("U1", { event: { source: { groupId: "G1" } } });
      expect(name).toBe("DB名");
      expect(lineUtil.getGroupMemberProfile).not.toHaveBeenCalled();
      expect(getUserProfileMock).not.toHaveBeenCalled();
    });

    it("DB miss + groupId → getGroupMemberProfile", async () => {
      mysql.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });
      lineUtil.getGroupMemberProfile.mockResolvedValue({ displayName: "群組名" });
      const name = await getDisplayName("U1", { event: { source: { groupId: "G1" } } });
      expect(name).toBe("群組名");
      expect(lineUtil.getGroupMemberProfile).toHaveBeenCalledWith("G1", "U1");
      expect(getUserProfileMock).not.toHaveBeenCalled();
    });

    it("DB miss + no groupId → getUserProfile", async () => {
      mysql.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });
      getUserProfileMock.mockResolvedValue({ displayName: "直通名" });
      const name = await getDisplayName("U1", { event: { source: {} } });
      expect(name).toBe("直通名");
      expect(lineUtil.getGroupMemberProfile).not.toHaveBeenCalled();
      expect(getUserProfileMock).toHaveBeenCalledWith("U1");
    });

    it("getGroupMemberProfile fails → getUserProfile", async () => {
      mysql.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });
      lineUtil.getGroupMemberProfile.mockRejectedValue(new Error("403"));
      getUserProfileMock.mockResolvedValue({ displayName: "救援名" });
      const name = await getDisplayName("U1", { event: { source: { groupId: "G1" } } });
      expect(name).toBe("救援名");
    });

    it("all fail → 玩家", async () => {
      mysql.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockRejectedValue(new Error("db")),
      });
      lineUtil.getGroupMemberProfile.mockRejectedValue(new Error("403"));
      getUserProfileMock.mockRejectedValue(new Error("404"));
      const name = await getDisplayName("U1", { event: { source: { groupId: "G1" } } });
      expect(name).toBe("玩家");
    });

    it("works with undefined context", async () => {
      mysql.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
      });
      getUserProfileMock.mockResolvedValue({ displayName: "無 ctx 名" });
      const name = await getDisplayName("U1");
      expect(name).toBe("無 ctx 名");
    });
  });
});
