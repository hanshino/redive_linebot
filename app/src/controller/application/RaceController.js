const { text } = require("bottender/router");
const RaceService = require("../../service/RaceService");
const { race } = require("../../model/application/Race");
const { raceRunner } = require("../../model/application/RaceRunner");
const { raceBet } = require("../../model/application/RaceBet");
const config = require("config");

const raceConfig = config.get("minigame.race");

exports.router = [
  text(/^[.#/](賽馬)$/i, showRaceStatus),
  text(/^[.#/]下注\s*(.+)\s+(\d+)$/i, placeBet),
  text(/^[.#/](賽馬紀錄)$/i, showBetHistory),
];

async function showRaceStatus(context) {
  const activeRace = await race.getActive();

  if (!activeRace) {
    await context.replyText("目前沒有進行中的比賽，請等待下一場開賽！");
    return;
  }

  const runners = await raceRunner.getByRace(activeRace.id);
  const trackLen = raceConfig.trackLength;

  let statusText = "";
  if (activeRace.status === "betting") {
    const endTime = new Date(activeRace.betting_end_at);
    statusText = `🏇 下注中！截止時間: ${endTime.toLocaleTimeString("zh-TW")}\n\n`;
  } else {
    statusText = `🏇 比賽進行中！第 ${activeRace.round} 回合\n\n`;
  }

  for (const runner of runners) {
    const progress = "▓".repeat(runner.position) + "░".repeat(trackLen - runner.position);
    statusText += `${runner.lane}. ${runner.character_name} [${progress}] ${runner.position}/${trackLen}\n`;
  }

  await context.replyText(statusText);
}

async function placeBet(context, { match }) {
  const { userId } = context.event.source;
  const characterName = match[1].trim();
  const amount = parseInt(match[2], 10);

  const activeRace = await race.getActive();
  if (!activeRace || activeRace.status !== "betting") {
    await context.replyText("目前沒有開放下注的比賽！");
    return;
  }

  const runners = await raceRunner.getByRace(activeRace.id);
  const target = runners.find(r => r.character_name === characterName);
  if (!target) {
    const names = runners.map(r => `${r.lane}. ${r.character_name}`).join("\n");
    await context.replyText(`找不到角色「${characterName}」，本場參賽角色:\n${names}`);
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
    `✅ 成功下注 ${amount} 女神石在「${characterName}」！\n` +
      `目前賠率: ${targetOdd ? targetOdd.odds : "-"}x`
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
