function computePerMsgXp({ base, cooldownRate, groupBonus, status }) {
  const blessing1 = Array.isArray(status.blessings) && status.blessings.includes(1) ? 0.08 : 0;
  return Math.round(base * cooldownRate * groupBonus * (1 + blessing1));
}

module.exports = { computePerMsgXp };
