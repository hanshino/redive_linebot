const ScheduleModel = require("../../model/princess/schedule");
const ScheduleTemplate = require("../../templates/princess/schedule");
const { recordSign } = require("../../util/traffic");

exports.showSchedule = async context => {
  recordSign("showSchedule");
  const EventDatas = await ScheduleModel.getDatas();

  var result = {
    ExpireEvent: [],
    HoldingEvent: [],
    FutureEvent: [],
  };
  let now = new Date().getTime();
  let strDisPrefix = ["天", "時", "分"];

  EventDatas.forEach(data => {
    let end_time = new Date(data.end_time).getTime();
    let start_time = new Date(data.start_time).getTime();
    let distance = "到期";

    if (now > end_time) {
      data.distance = distance;
      if (result.ExpireEvent.length > 2) return;
      result.ExpireEvent.push(data);
    } else if (now > start_time) {
      distance = getDistanceSpecifiedTime(now, end_time);
      data.distance = distance
        .map((d, index) => {
          return d + strDisPrefix[index];
        })
        .join(" ");
      result.HoldingEvent.push(data);
    } else {
      distance = getDistanceSpecifiedTime(now, start_time);
      data.distance = distance
        .map((d, index) => {
          return d + strDisPrefix[index];
        })
        .join(" ");
      result.FutureEvent.push(data);
    }
  });

  ScheduleTemplate.showSchedule(context, result);
};

/**
 * 小的放前，大的放後
 * @param {Date} start 起始日期
 * @param {Date} end  結束日期
 */
function getDistanceSpecifiedTime(start, end) {
  var EndTime = new Date(end);
  var NowTime = new Date(start);
  var t = EndTime.getTime() - NowTime.getTime();
  var d = Math.floor(t / 1000 / 60 / 60 / 24);
  var h = Math.floor((t / 1000 / 60 / 60) % 24);
  var m = Math.floor((t / 1000 / 60) % 60);

  return [d, h, m];
}
