/**
 * 存放通用函式庫
 */
module.exports = {
  assemble: function (mapData, strData) {
    var objMapData = {};

    Object.keys(mapData).forEach(key => {
      let newIndex = "{" + key.toLowerCase() + "}";
      objMapData[newIndex] = mapData[key];
    });

    var re = new RegExp(Object.keys(objMapData).join("|"), "gi");

    var strResult = strData.replace(re, function (matched) {
      matched = matched.toLowerCase();
      return objMapData[matched];
    });

    return strResult;
  },

  /**
   * 取得Liff網址
   * @param {String} type ian, compact, full, tall
   */
  getLiffUri: function (type) {
    let host = "https://liff.line.me/";
    let id = process.env.LINE_LIFF_ID;
    let typeId;
    switch (type.toLowerCase()) {
      case "ian":
        typeId = process.env.LINE_LIFF_IAN_ID;
        break;
      case "compact":
        typeId = process.env.LINE_LIFF_COMPACT_ID;
        break;
      case "full":
        typeId = process.env.LINE_LIFF_FULL_ID;
        break;
      case "tall":
        typeId = process.env.LINE_LIFF_TALL_ID;
        break;
    }

    id = typeId || id;

    return `${host}${id}`;
  },
};
