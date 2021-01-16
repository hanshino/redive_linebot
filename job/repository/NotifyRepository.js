/**
 * 訂閱類型轉譯成資料
 * @param {Array} SubscribeType
 * @param {Number} intSubType
 * @returns {Array<{key: String, title: String, description: String, status: Number}>}
 */
exports.transSubData = (SubscribeType, intSubType) => {
  const SubSwitch = this.getSubSwitch(SubscribeType);
  let switchAry = SubSwitch.join("") + intSubType.toString(2);
  switchAry = switchAry.substr(SubSwitch.length * -1).split("");
  return SubscribeType.map((data, index) => ({ ...data, status: parseInt(switchAry[index]) }));
};

exports.getSubSwitch = SubscribeType => {
  return Array.from({ length: SubscribeType.length }).map(() => "0");
};
