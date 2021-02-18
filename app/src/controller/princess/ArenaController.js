const { text, route } = require("bottender/router");
const { getClient } = require("bottender");
const line = getClient("line");
const OpencvModel = require("../../model/application/OpencvModel");
const ArenaModel = require("../../model/princess/arena");
const RecordRepo = require("../../repositories/princess/arena/RecordRepository");
const ArenaTemplate = require("../../templates/princess/ArenaTeamplate");
const quickReplyUpload = {
  items: [
    {
      type: "action",
      label: "點我上傳",
      action: {
        type: "cameraRoll",
        label: "點我上傳",
      },
    },
  ],
};
const quickReplyAskWhich = {
  items: [
    {
      type: "action",
      action: {
        type: "message",
        label: "⚒我是攻擊方",
        text: "1",
      },
    },
    {
      type: "action",
      action: {
        type: "message",
        label: "🛡我是防守方",
        text: "2",
      },
    },
  ],
};

exports.router = context => {
  const { type } = context.event.source;
  if (type === "user") return personalRouter();
  else return [];
};

function personalRouter(context) {
  return [
    text(/^[.#](競技場上傳|arenaupload)$/, setPersonalAllowUpload),
    text(/^[.#](競技場(搜尋|查詢)|arenasearch)$/, setArenaSearch),
    text(/^[.#](競技場結束操作|arenareset)$/, resetArenaState),
    route(isAllowPersonalUploadArena, receivePersonalImage),
    route(isChooseTypeMessage, personalUpload),
    route(isAllowSearchArena, arenaSearch),
  ];
}

function setPersonalAllowUpload(context) {
  context.setState({ arena: { arenaUpload: true } });
  context.sendText("請上傳競技場戰鬥紀錄，全部上傳完畢後請輸入\n#競技場上傳完畢", {
    quickReply: quickReplyUpload,
  });
}

function setArenaSearch(context) {
  context.setState({ arena: { arenaSearch: true } });
  context.sendText("請上傳要查詢的隊伍", {
    quickReply: quickReplyUpload,
  });
}

function resetArenaState(context) {
  let arenaState = context.state.arena || {};
  if (Object.keys(arenaState).length !== 0) {
    context.setState({ arena: {} });
    context.sendText("感謝使用競技場功能~~");
  }
}

/**
 * 個人視窗上傳競技場紀錄
 * @param {Context} context
 */
function isAllowPersonalUploadArena(context) {
  return context.event.isImage && context.state.arena.arenaUpload;
}

/**
 * 競技場解陣查詢
 * @param {Context} context
 */
function isAllowSearchArena(context) {
  return context.event.isImage && context.state.arena.arenaSearch;
}

function isChooseTypeMessage(context) {
  if (!context.event.isText) return false; // 非文字訊息
  let { text } = context.event.message;
  if (["1", "2"].indexOf(text) === -1) return false; // 非回答問題
  if (!context.state.arena) return false; // 無session紀錄
  if (!context.state.arena.storeId) return false;
  return true;
}

/**
 * 將圖片暫存，詢問玩家此圖為 攻or守
 * 暫存id寫入session
 * @param {Context} context
 */
function receivePersonalImage(context) {
  let { id } = context.event.image;
  let storeId = ArenaModel.storeImageId(id);
  let arenaState = context.state.arena;

  context.setState({
    arena: { ...arenaState, storeId },
  });

  context.sendText(
    "請問此圖左邊隊伍為\n1:進攻方 or 2:防守方\n輸入數字回答，手機用戶可直接點選快速回覆鈕",
    { quickReply: quickReplyAskWhich }
  );
}

/**
 * 紀錄上傳，蒐集戰報寫入資料庫
 * @param {Context} context
 */
async function personalUpload(context) {
  let { text } = context.event.message;
  let arenaState = context.state.arena;
  let { storeId } = arenaState;
  let imageId = await ArenaModel.getImageId(storeId);

  if (!imageId) {
    delete arenaState.storeId;
    context.setState({
      arena: { ...arenaState },
    });
    return context.sendText("超過60秒沒回應，請重新進行操作");
  }

  let imageBase = await getImageBase(imageId);
  let resp = await OpencvModel.analyzeArenaBattle(imageBase);

  let { userId, type } = context.event.source;
  let sourceId = context.event.source[`${type}Id`];

  let insertSuccess = await RecordRepo.insert({ ...resp, userId, sourceId, type: text });
  if (insertSuccess) {
    ArenaTemplate.showUploadInfo(context, resp);
    ArenaTemplate.askContinue(context);
  } else {
    context.sendText("你已經上傳過此紀錄");
  }
}

async function arenaSearch(context) {
  let imageBase = await getImageBase(context.event.image.id);
  let resp = await OpencvModel.getArenaSearchTeam(imageBase);

  if (resp === false) {
    return context.sendText("分析失敗，已將圖片轉發給作者");
  }

  let searchTeam = RecordRepo.genTeamImages(resp.map(data => ({ unitId: data.unit_id, ...data })));
  let result = await RecordRepo.index(resp);

  if (result.length === 0) {
    ArenaTemplate.showSearchNoneData(context, searchTeam);
  } else {
    ArenaTemplate.showSearchResult(context, searchTeam, result);
  }
}

function getImageBase(messageId) {
  return line.getMessageContent(messageId).then(buffer => {
    return buffer.toString("base64");
  });
}
