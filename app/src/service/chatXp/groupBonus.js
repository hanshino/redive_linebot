function computeGroupBonus(memberCount, status) {
  if (status.active_trial_star === 4) return 1.0;

  let slope = 0.02;
  if (Array.isArray(status.blessings) && status.blessings.includes(6)) slope = 0.025;
  if (status.group_bonus_double) slope = Math.max(slope * 2, 0.04);

  let bonus = memberCount < 5 ? 1.0 : 1 + (memberCount - 5) * slope;

  if (memberCount < 10 && Array.isArray(status.blessings) && status.blessings.includes(7)) {
    bonus *= 1.3;
  }

  return bonus;
}

module.exports = { computeGroupBonus };
