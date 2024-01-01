exports.delay = async ms => {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
};

/**
 * @typedef {Object} setting
 * @property {Number} rate - 機率, max: 100
 * @property {any} value - 值
 * @param {Array<setting>} settings
 * @returns {any} - value
 */
exports.random = settings => {
  const totalRate = settings.reduce((acc, cur) => acc + cur.rate, 0);
  if (totalRate !== 100) {
    throw new Error("total rate must be 100");
  }

  const random = Math.floor(Math.random() * 100) + 1;
  let rate = 0;
  for (let i = 0; i < settings.length; i++) {
    rate += settings[i].rate;
    if (random <= rate) {
      return settings[i].value;
    }
  }
};
