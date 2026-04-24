const TIER1_RATE = 1.0;
const TIER2_RATE = 0.3;
const TIER3_RATE = 0.03;

function applyDiminish(incoming, dailyBefore, status) {
  if (incoming <= 0) return 0;

  const blessings = Array.isArray(status.blessings) ? status.blessings : [];
  const tier1Upper = blessings.includes(4) ? 300 : 200;
  const tier2Upper = blessings.includes(5) ? 600 : 500;

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
    cursor += take;
  }
  if (remaining > 0) {
    result += remaining * TIER3_RATE;
  }

  return result;
}

module.exports = { applyDiminish };
