const { text, route } = require("bottender/router");
const { getClient } = require("bottender");
const line = getClient("line");
const OpencvModel = require("../../model/application/OpencvModel");
const RecordRepo = require("../../repositories/princess/arena/RecordRepository");

exports.router = context => {
  const { type } = context.event.source;
  if (type === "user") return personalRouter();
};

function personalRouter(context) {
  return [
    text(/^[.#]競技場上傳$/, setPersonalAllowUpload),
    route(isAllowPersonalUploadArena, personalUpload),
  ];
}

function setPersonalAllowUpload(context) {
  context.setState({ arenaUpload: true });
  context.sendText("請上傳競技場戰鬥紀錄，全部上傳完畢後請輸入\n#競技場上傳完畢");
}

/**
 * 個人視窗上傳競技場紀錄
 * @param {Context} context
 */
function isAllowPersonalUploadArena(context) {
  return context.event.isImage && context.state.arenaUpload;
}

async function personalUpload(context) {
  let imageBase = await getImageBase(context.event.image.id);
  let resp = await OpencvModel.analyzeArenaBattle(imageBase);

  let { userId, type } = context.event.source;
  let sourceId = context.event.source[`${type}Id`];

  await RecordRepo.insert({ ...resp, userId, sourceId });
  context.sendText(JSON.stringify(resp));
}

function getImageBase(messageId) {
  return line.getMessageContent(messageId).then(buffer => {
    return buffer.toString("base64");
  });
}
