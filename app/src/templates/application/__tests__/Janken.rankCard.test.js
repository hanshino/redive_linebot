const tpl = require("../Janken");

test("generateRankCard renders season block when seasonId provided", () => {
  const card = tpl.generateRankCard({
    rankLabel: "見習者 5",
    rankImageKey: "rank_beginner",
    elo: 1000,
    winCount: 0,
    loseCount: 0,
    drawCount: 0,
    winRate: 0,
    streak: 0,
    maxStreak: 0,
    bounty: 0,
    eloToNext: 100,
    serverRank: 1,
    maxBet: 50000,
    baseUrl: "https://x",
    seasonId: 2,
    seasonStartedAt: new Date(),
    lifetime: { win: 100, lose: 50, draw: 5 },
    todayReward: { type: "top1", amount: 500 },
  });
  const rendered = JSON.stringify(card);
  expect(rendered).toContain("第 2 賽季");
  expect(rendered).toContain("100 勝 / 50 敗");
  expect(rendered).toContain("+500 女神石");
});

test("generateRankCard hides season/lifetime/todayReward blocks when null", () => {
  const card = tpl.generateRankCard({
    rankLabel: "見習者 5",
    rankImageKey: "rank_beginner",
    elo: 1000,
    winCount: 0,
    loseCount: 0,
    drawCount: 0,
    winRate: 0,
    streak: 0,
    maxStreak: 0,
    bounty: 0,
    eloToNext: 100,
    serverRank: 1,
    maxBet: 50000,
    baseUrl: "https://x",
  });
  const rendered = JSON.stringify(card);
  expect(rendered).not.toContain("賽季");
  expect(rendered).not.toContain("生涯戰績");
});
