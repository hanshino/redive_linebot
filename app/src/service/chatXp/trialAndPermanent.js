function applyTrialAndPermanent(effective, status) {
  let trialMult = 1.0;
  if (status.active_trial_star === 2) trialMult = 0.7;
  else if (status.active_trial_star === 5) trialMult = 0.5;

  const permanent = Number(status.permanent_xp_multiplier) || 0;
  const permanentMult = 1 + permanent;

  return {
    result: effective * trialMult * permanentMult,
    trialMult,
    permanentMult,
  };
}

module.exports = { applyTrialAndPermanent };
