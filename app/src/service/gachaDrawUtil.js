const random = require("math-random");

function getTotalRate(gachaPool) {
  const result = gachaPool
    .map(data => parseFloat(data.rate.replace("%", "")) || 0)
    .reduce((pre, curr) => pre + curr, 0);
  return [Math.round(result * 10000), 10000];
}

function genRandom(max, min, times = 1) {
  const result = [];
  for (let i = 0; i < times; i++) {
    result.push(Math.round(random() * (max - min) + min));
  }
  return result;
}

function play(gachaPool, times = 1) {
  const [max, rate] = getTotalRate(gachaPool);
  const randomAry = genRandom(max, 1, times).sort((a, b) => a - b);

  let stack = 0;
  let anchor = 0;
  const rewards = [];

  gachaPool.forEach(data => {
    if (anchor >= randomAry.length) return;
    const top = Math.floor(parseFloat(data.rate.replace(/[^\d.]+/, "") * rate));

    while (
      randomAry[anchor] >= stack &&
      randomAry[anchor] <= stack + top &&
      anchor < randomAry.length
    ) {
      rewards.push({ ...data });
      anchor++;
    }

    stack += top;
  });

  return rewards;
}

function getRainbowCharater(gachaPool) {
  return gachaPool.filter(data => data.star == 3);
}

function filterPool(gachaPool, tag) {
  if (tag === undefined) return gachaPool.filter(data => data.isPrincess === "1");

  let isPrincess = true;
  const resultPool = gachaPool.filter(data => {
    const tags = (data.tag || "").split(",");
    if (tags.indexOf(tag) !== -1) {
      isPrincess = data.isPrincess === "0" ? false : true;
      return true;
    }
  });

  if (isPrincess === false) return resultPool;
  if (resultPool.length === 0) return gachaPool.filter(data => data.isPrincess === "1");
  return resultPool.concat(gachaPool.filter(data => data.star < 3 && data.isPrincess === "1"));
}

function boostRate(pool, shouldBoost, boost) {
  return pool.map(data => {
    if (!shouldBoost(data)) return data;
    return {
      ...data,
      rate: `${(parseFloat(data.rate) * (100 + boost)) / 100}%`,
    };
  });
}

function makePickup(pool, rate = 100) {
  return boostRate(pool, data => data.star === "3", rate);
}

function applyBannerRateUp(pool, characterIds, rateBoost) {
  const idSet = new Set(characterIds);
  return boostRate(pool, data => idSet.has(data.id), rateBoost);
}

function parseRate(value) {
  if (value == null) return 0;
  const raw = typeof value === "object" ? value.rate : value;
  return parseFloat((raw || "0").toString().replace("%", "")) || 0;
}

function fmtRate(n) {
  return Number(n.toFixed(4));
}

function summarizePool(pool) {
  const byStar = { 1: 0, 2: 0, 3: 0 };
  for (const data of pool) {
    const rate = parseRate(data);
    const star = parseInt(data.star, 10);
    if (byStar[star] !== undefined) byStar[star] += rate;
  }
  const total = byStar[1] + byStar[2] + byStar[3];
  return { entries: pool.length, total, byStar };
}

module.exports = {
  play,
  filterPool,
  getRainbowCharater,
  makePickup,
  applyBannerRateUp,
  summarizePool,
  parseRate,
  fmtRate,
};
