const TIER1_RATE = 1.0;
const TIER2_RATE = 0.3;
const TIER3_RATE = 0.03;

const TIER1_BASE_UPPER = 400;
const TIER1_BLESSING4_UPPER = 600;
const TIER2_BASE_UPPER = 1000;
const TIER2_BLESSING5_UPPER = 1200;

function resolveTierUppers(blessingIds) {
  const ids = Array.isArray(blessingIds) ? blessingIds : [];
  return {
    tier1Upper: ids.includes(4) ? TIER1_BLESSING4_UPPER : TIER1_BASE_UPPER,
    tier2Upper: ids.includes(5) ? TIER2_BLESSING5_UPPER : TIER2_BASE_UPPER,
  };
}

function applyDiminish(incoming, dailyBefore, status) {
  if (incoming <= 0) return { result: 0, factor: 0 };

  const { tier1Upper, tier2Upper } = resolveTierUppers(status.blessings);

  let remaining = incoming;
  let cursor = dailyBefore;
  let result = 0;

  if (cursor < tier1Upper) {
    const take = Math.min(remaining, tier1Upper - cursor);
    result += take * TIER1_RATE;
    remaining -= take;
    cursor += take;
  }
  if (remaining > 0 && cursor < tier2Upper) {
    const take = Math.min(remaining, tier2Upper - cursor);
    result += take * TIER2_RATE;
    remaining -= take;
  }
  if (remaining > 0) {
    result += remaining * TIER3_RATE;
  }

  return { result, factor: result / incoming };
}

module.exports = {
  applyDiminish,
  resolveTierUppers,
  TIER1_RATE,
  TIER2_RATE,
  TIER3_RATE,
};
