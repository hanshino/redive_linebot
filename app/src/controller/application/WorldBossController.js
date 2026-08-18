const { text } = require("bottender/router");
const SeasonService = require("../../service/WorldBossSeasonService");
const WorldBossTemplate = require("../../templates/application/WorldBoss");
const { getLiffUri } = require("../../templates/common");

const WORLD_BOSS_LIFF_PATH = "/worldboss";

/**
 * `#世界王` is a shared group board: season, cycle, the five boss snapshots and the
 * one LIFF link everybody uses. Nothing about the person who typed it may appear —
 * quota, EXP, rewards and personal damage live behind authenticated LIFF only.
 */
async function showBattleStatus(context) {
  const status = await SeasonService.getBattleStatus();
  const bubble = WorldBossTemplate.generateWorldBossReply({
    status,
    liffUri: getLiffUri("full", WORLD_BOSS_LIFF_PATH),
  });
  return context.replyFlex("世界王", bubble);
}

/**
 * Retired. Attacks moved to the authenticated LIFF endpoint
 * `POST /api/world-boss/attack`; no Flex message produces this postback any more.
 * Old cards still in users' chat history must hit a dead end, not a second code
 * path that could drift from the API's rules — so this executes nothing and
 * replies nothing.
 */
async function attackOnBoss() {
  return;
}

exports.router = [text(/^[.#/](世界王|worldboss)$/i, showBattleStatus)];
exports.showBattleStatus = showBattleStatus;
exports.attackOnBoss = attackOnBoss;
