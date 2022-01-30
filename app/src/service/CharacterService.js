exports.changeRarity = (unitId, rarity = 1) => {
  let newRarity = parseInt(unitId) + rarity * 10;
  return newRarity.toString();
};
