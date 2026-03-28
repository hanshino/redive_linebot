const { text } = require("bottender/router");
const RaceService = require("../../service/RaceService");
const { race } = require("../../model/application/Race");
const { raceRunner } = require("../../model/application/RaceRunner");
const { raceBet } = require("../../model/application/RaceBet");
const { generateRaceCarousel } = require("../../templates/application/Race");

exports.router = [
  text(/^[.#/](賽跑)$/i, showRaceStatus),
  text(/^[.#/]賽跑下注\s*(\d+)\s+(\d+)$/i, placeBet),
  text(/^[.#/]賽跑下注\s*$/i, placeBetHelp),
  text(/^[.#/](賽跑紀錄)$/i, showBetHistory),
];

async function showRaceStatus(context) {
  const [activeRace, recentFinished] = await Promise.all([
    race.getActive(),
    race.getRecentFinished(5),
  ]);

  if (!activeRace && recentFinished.length === 0) {
    await context.replyText("目前沒有進行中的比賽，請等待下一場開賽！");
    return;
  }

  const races = [];

  if (activeRace) {
    const details = await RaceService.getRaceDetails(activeRace.id);
    races.push({ raceData: activeRace, ...details });
  } else if (recentFinished.length > 0) {
    // No active race — show the most recently finished race's track + events
    const lastRaceId = recentFinished[0].id;
    const [lastRace, details] = await Promise.all([
      race.find(lastRaceId),
      RaceService.getRaceDetails(lastRaceId),
    ]);
    if (lastRace) {
      races.push({ raceData: lastRace, ...details });
    }
  }

  const flexMessage = generateRaceCarousel(races, recentFinished);
  await context.replyFlex(flexMessage.altText, flexMessage.contents);
}

async function placeBet(context, { match }) {
  const { userId } = context.event.source;
  const lane = parseInt(match[1], 10);
  const amount = parseInt(match[2], 10);

  const activeRace = await race.getActive();
  if (!activeRace || activeRace.status !== "betting") {
    await context.replyText("目前沒有開放下注的比賽！");
    return;
  }

  const runners = await raceRunner.getByRace(activeRace.id);
  const target = runners.find(r => r.lane === lane);
  if (!target) {
    const names = runners.map(r => `${r.lane}. ${r.character_name}`).join("\n");
    await context.replyText(`找不到角色編號 ${lane}，本場參賽角色:\n${names}`);
    return;
  }

  const result = await RaceService.placeBet(userId, activeRace.id, target.id, amount);
  if (!result.success) {
    await context.replyText(result.error);
    return;
  }

  const odds = await RaceService.getOdds(activeRace.id);
  const targetOdd = odds.find(o => o.runnerId === target.id);
  await context.replyText(
    `✅ 成功下注 ${amount} 女神石在 ${target.lane}號「${target.character_name}」！\n` +
      `目前賠率: ${targetOdd ? targetOdd.odds : "-"}x`
  );
}

async function placeBetHelp(context) {
  await context.replyText(
    "📋 下注指令說明\n" +
      "格式：.賽跑下注 {角色編號} {金額}\n" +
      "範例：.賽跑下注 1 500\n\n" +
      "輸入 .賽跑 查看目前比賽及角色編號"
  );
}

async function showBetHistory(context) {
  const { userId } = context.event.source;
  const recentBets = await raceBet.knex
    .where("race_bet.user_id", userId)
    .join("race_runner", "race_bet.runner_id", "race_runner.id")
    .join("race_character", "race_runner.character_id", "race_character.id")
    .join("race", "race_bet.race_id", "race.id")
    .select("race_bet.*", "race_character.name as character_name", "race.status as race_status")
    .orderBy("race_bet.created_at", "desc")
    .limit(10);

  if (recentBets.length === 0) {
    await context.replyText("你還沒有下注紀錄！");
    return;
  }

  let msg = "🏇 最近下注紀錄:\n\n";
  for (const bet of recentBets) {
    const statusIcon = bet.payout > 0 ? "🏆" : bet.payout === 0 ? "❌" : "⏳";
    const payoutText =
      bet.payout !== null ? ` → ${bet.payout > 0 ? "+" : ""}${bet.payout || "未中獎"}` : "";
    msg += `${statusIcon} ${bet.character_name} | ${bet.amount} 石${payoutText}\n`;
  }

  await context.replyText(msg);
}
