const BASELINE_RATES = { t0_1: 0, t1_2: 0.1, t2_4: 0.5, t4_6: 0.8, tFull: 1.0 };

function buildTable(status) {
  let t0_1 = 1000;
  let t1_2 = 2000;
  let t2_4 = 4000;
  let t4_6 = 6000;

  if (status.active_trial_star === 3) {
    t0_1 = 1333;
    t1_2 = 2666;
    t2_4 = 5333;
    t4_6 = 7998;
  }

  const rates = { ...BASELINE_RATES };

  if (status.rhythm_mastery) {
    rates.t2_4 = 0.7;
    rates.t4_6 = 0.9;
  }

  if (Array.isArray(status.blessings) && status.blessings.includes(2)) {
    t4_6 -= 1000;
  }

  if (Array.isArray(status.blessings) && status.blessings.includes(3)) {
    rates.t0_1 = 0.1;
    rates.t1_2 = 0.3;
  }

  return [
    { maxMs: t0_1, rate: rates.t0_1 },
    { maxMs: t1_2, rate: rates.t1_2 },
    { maxMs: t2_4, rate: rates.t2_4 },
    { maxMs: t4_6, rate: rates.t4_6 },
    { maxMs: Infinity, rate: rates.tFull },
  ];
}

function selectCooldownRate(timeDiffMs, status) {
  if (timeDiffMs === null || timeDiffMs === undefined) return 1.0;
  const table = buildTable(status);
  for (const row of table) {
    if (timeDiffMs < row.maxMs) return row.rate;
  }
  return 1.0;
}

module.exports = { selectCooldownRate, buildTable };
