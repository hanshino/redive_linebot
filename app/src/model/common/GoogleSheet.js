const { default: axios } = require("axios");
const SheetUrl = "https://docs.google.com/spreadsheets/u/0/d/{key}/gviz/tq?";

module.exports = {
  /**
   * 使用SQL語法取得表單資料
   * @param {Object} objData 必備參數：gid,type,query,key
   */
  querySheetData: function (objData) {
    let params = {
      gid: objData.gid,
      tqx: "out:" + objData.type,
      tq: encodeURIComponent(objData.query),
    };

    let queryString = Object.keys(params)
      .map(key => {
        return key + "=" + params[key];
      })
      .join("&");

    let url = SheetUrl.replace("{key}", objData.key) + queryString;

    return queryData(url);
  },
};

async function queryData(url) {
  try {
    const res = await axios.get(url);
    const data = res.data;
    let jsonString = data.match(/\{.*\}/)[0];
    return queryParse(JSON.parse(jsonString));
  } catch (err) {
    console.log(err);
    console.log("Google表單回傳物件無法解析");
    return false;
  }
}

function queryParse(data) {
  let rows = data.table.rows;

  let title = data.table.cols.map(col => {
    return col.label !== "" ? col.label.trim() : col.id;
  });

  let result = [];

  rows.forEach(function (row) {
    let temp = {};
    row.c.forEach(function (value, index) {
      if (value === null) return;
      temp[title[index]] = Object.prototype.hasOwnProperty.call(value, "f") ? value.f : value.v;
    });
    result.push(temp);
  });

  return result;
}
