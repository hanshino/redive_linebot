jest.mock("../../../service/MinigameService", () => ({
  findByUserId: jest.fn(),
  changeUserJob: jest.fn(),
}));

const MinigameService = require("../../../service/MinigameService");
const Controller = require("../JobController");

function ctx(userId = "Ujob") {
  return { event: { source: { userId } }, replyText: jest.fn(), replyFlex: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("JobController.showMyJob", () => {
  it("reports job, level, skill and the mage effect for a player with progress", async () => {
    MinigameService.findByUserId.mockResolvedValue({
      level: 42,
      job_key: "mage",
      job_name: "法師",
    });
    const c = ctx();

    await Controller.showMyJob(c);

    expect(c.replyText).toHaveBeenCalledTimes(1);
    const reply = c.replyText.mock.calls[0][0];
    expect(reply).toContain("職業：法師（等級 42）");
    expect(reply).toContain("技能：元素之力，消耗 7 點，造成 0.7 倍傷害");
    expect(reply).toContain("魔力刻印");
    expect(reply).toContain("25% 機率觸發暴擊");
  });

  it("reports 'no lingering effect' for swordman/thief", async () => {
    MinigameService.findByUserId.mockResolvedValue({
      level: 30,
      job_key: "swordman",
      job_name: "劍士",
    });
    const c = ctx();

    await Controller.showMyJob(c);

    const reply = c.replyText.mock.calls[0][0];
    expect(reply).toContain("職業：劍士（等級 30）");
    expect(reply).toContain("攻擊後不會留下任何效果。");
  });

  it("falls back to Lv.1 adventurer for a brand-new player with no progress row", async () => {
    MinigameService.findByUserId.mockResolvedValue(null);
    const c = ctx();

    await expect(Controller.showMyJob(c)).resolves.not.toThrow();

    const reply = c.replyText.mock.calls[0][0];
    expect(reply).toContain("職業：冒險者（等級 1）");
    expect(reply).toContain("技能：奮力揮擊，消耗 8 點，造成 1.2 倍傷害");
    expect(reply).toContain("鼓舞");
  });

  it("never includes personal progress fields (quota, EXP, score, ranking)", async () => {
    MinigameService.findByUserId.mockResolvedValue({
      level: 10,
      job_key: "thief",
      job_name: "盜賊",
    });
    const c = ctx();

    await Controller.showMyJob(c);

    const reply = c.replyText.mock.calls[0][0];
    for (const forbidden of ["今日", "剩餘", "EXP", "排名", "分數"]) {
      expect(reply).not.toContain(forbidden);
    }
  });
});
