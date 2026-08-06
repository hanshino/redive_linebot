"use strict";

const { selectCooldownRate } = require("./cooldownTable");
const { computeGroupBonus } = require("./groupBonus");
const { computePerMsgXp } = require("./perMsgXp");
const { applyDiminish } = require("./diminishTier");
const { applyTrialAndPermanent } = require("./trialAndPermanent");
const { mult, silenceMult } = require("./weatherEffects");

/**
 * Pure per-message XP computation. `effects` is the effective weather effect map
 * ({} = neutral, reproduces pre-weather behaviour). `dailyRawBefore` + `rawDeltaSoFar`
 * feed the diminish-tier cursor; `catchupMult` is the per-batch catch-up scalar.
 */
function computeEventXp({
  event,
  state,
  base,
  effects,
  dailyRawBefore,
  rawDeltaSoFar,
  catchupMult,
}) {
  const cdMult = mult(effects, "cooldown_required_mult");
  const adjustedTime =
    event.timeSinceLastMsg == null ? event.timeSinceLastMsg : event.timeSinceLastMsg / cdMult;
  const cooldownRate = selectCooldownRate(adjustedTime, state);

  const groupBonus = computeGroupBonus(event.groupCount, state) * mult(effects, "group_bonus_mult");

  const { raw: rawBase, blessing1Mult } = computePerMsgXp({
    base,
    cooldownRate,
    groupBonus,
    status: state,
  });
  const raw = rawBase * mult(effects, "raw_xp_mult") * silenceMult(effects, event.timeSinceLastMsg);

  const honeymoonMult = state.prestige_count === 0 ? 1.2 : 1.0;
  const scaledIncoming = raw * honeymoonMult;
  const scaledBefore = (dailyRawBefore + rawDeltaSoFar) * honeymoonMult;
  const { result: afterDiminish, factor: diminishFactor } = applyDiminish(
    scaledIncoming,
    scaledBefore,
    state
  );
  const {
    result: afterTrialPermanent,
    trialMult,
    permanentMult,
  } = applyTrialAndPermanent(afterDiminish, state);

  const finalEffective = afterTrialPermanent * catchupMult * mult(effects, "effective_xp_mult");
  const effectiveInt = Math.max(0, Math.round(finalEffective));

  return {
    raw,
    effectiveInt,
    cooldownRate,
    groupBonus,
    blessing1Mult,
    honeymoonMult,
    diminishFactor,
    trialMult,
    permanentMult,
  };
}

module.exports = { computeEventXp };
