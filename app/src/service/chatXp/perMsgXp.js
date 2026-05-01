function computePerMsgXp({ base, cooldownRate, groupBonus, status }) {
  const hasBlessing1 = Array.isArray(status.blessings) && status.blessings.includes(1);
  const blessing1Mult = hasBlessing1 ? 1.08 : 1.0;
  const raw = Math.round(base * cooldownRate * groupBonus * blessing1Mult);
  return { raw, blessing1Mult };
}

module.exports = { computePerMsgXp };
