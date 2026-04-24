function applyTrialAndPermanent(effective, status) {
  let trialMult = 1.0;
  if (status.active_trial_star === 2) trialMult = 0.7;
  else if (status.active_trial_star === 5) trialMult = 0.5;

  const permanent = Number(status.permanent_xp_multiplier) || 0;
  return effective * trialMult * (1 + permanent);
}

module.exports = { applyTrialAndPermanent };
