const GachaModel = require("../../model/princess/gacha");
const InventoryModel = require("../../model/application/Inventory");
const random = require("math-random");
const GachaTemplate = require("../../templates/princess/gacha");
const memory = require("memory-cache");
const { recordSign } = require("../../util/traffic");
const allowParameter = ["name", "headimage_url", "star", "rate", "is_princess", "tag"];

function GachaException(message, code) {
  this.message = message;
  this.code = code;
  this.name = "Gacha";
}

GachaException.prototype = new Error();

function getTotalRate(gachaPool) {
  var result = gachaPool
    .map(data => parseFloat(data.rate.replace("%", "")))
    .reduce((pre, curr) => pre + curr);
  return [Math.round(result * 10000), 10000];
}

/**
 * 進行亂數產生
 * @param {Number} times
 * @returns {Array}
 */
function genRandom(max, min, times = 1) {
  let result = [];
  for (let i = 0; i < times; i++) {
    result.push(Math.round(random() * (max - min) + min));
  }

  return result;
}

/**
 * 進行轉蛋
 * @param {Array} gachaPool 轉蛋池
 */
function play(gachaPool, times = 1) {
  const [max, rate] = getTotalRate(gachaPool);
  // 產出亂數陣列，用該數字，取得轉蛋池中相對應位置之獎勵
  const randomAry = genRandom(max, 1, times).sort((a, b) => a - b);

  var stack = 0; // 數字堆疊
  var anchor = 0; // 處理到的亂數陣列錨點
  var rewards = []; // 轉出獎勵陣列

  gachaPool.forEach(data => {
    if (anchor >= randomAry.length) return;
    let top = Math.floor(parseFloat(data.rate.replace("%", "") * rate));

    // 介於轉蛋池中的 堆疊數 和 頂點 的亂數 即為抽出內容物
    while (
      randomAry[anchor] >= stack &&
      randomAry[anchor] <= stack + top &&
      anchor < randomAry.length
    ) {
      rewards.push({ ...data });
      anchor++; // 處理下一錨點
    }

    stack += top; // 數字往上堆疊
  });

  return rewards;
}

/**
 * 篩選出符合標籤之轉蛋池
 * @param {Array} gachaPool
 * @param {String} tag
 */
function filterPool(gachaPool, tag) {
  if (tag === undefined) return gachaPool.filter(data => data.isPrincess === "1");

  var isPrincess = true;
  var resultPool = gachaPool.filter(data => {
    let tags = (data.tag || "").split(",");
    if (tags.indexOf(tag) !== -1) {
      isPrincess = data.isPrincess === "0" ? false : true;
      return true;
    }
  });

  // 非公主池子，直接回傳
  if (isPrincess === false) return resultPool;

  // 無符合標籤，回傳滿池，不過將非公主角色排除
  if (resultPool.length === 0) return gachaPool.filter(data => data.isPrincess === "1");

  // 有篩選出特定標籤，將1,2星角色補滿池子
  return resultPool.concat(gachaPool.filter(data => data.star < 3 && data.isPrincess === "1"));
}

/**
 * Shuffles array in place. ES6 version
 * @param {Array} a items An array containing the items.
 */
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 針對群組單一用戶進行冷卻時間設定
 * @param {String} userId
 * @param {String} groupId
 */
function isAble(userId, groupId) {
  if (memory.get(`GachaCoolDown_${userId}_${groupId}`) === null) {
    memory.put(`GachaCoolDown_${userId}_${groupId}`, 1, 120 * 1000);
    return true;
  }

  return false;
}

module.exports = {
  play: async function (context, { match }) {
    recordSign("GachaPlay");
    try {
      var { tag, times } = match.groups;

      // 群組關閉轉蛋功能
      if (context.state.guildConfig.Gacha === "N") return;

      if (
        context.platform === "line" &&
        context.event.source.type === "group" &&
        isAble(context.event.source.userId, context.event.source.groupId) === false
      )
        return;

      const gachaPool = await GachaModel.getDatabasePool();
      var filtPool = filterPool(gachaPool, tag);

      times = (times || "10").length >= 3 ? 10 : parseInt(times);
      times = 10; // 暫定恆為10
      var rewards = [];
      var rareCount;

      do {
        rareCount = {};
        rewards = shuffle(play(filtPool, times));
        rewards.forEach(reward => {
          rareCount[reward.star] = rareCount[reward.star] || 0;
          rareCount[reward.star]++;
        });
      } while (rareCount[1] === 10);

      var { userId, type } = context.event.source;
      var DailyGachaInfo = false;

      if (type === "user") {
        var gachaSignin = await GachaModel.getSignin(userId);
        if (gachaSignin === undefined) {
          GachaModel.touchSingin(userId);
          let OwnGodStone = await GachaModel.getUserGodStoneCount(userId);
          DailyGachaInfo = await recordToInventory(userId, rewards);
          DailyGachaInfo.OwnGodStone = OwnGodStone;
        }
      }

      GachaTemplate.line.showGachaResult(
        context,
        {
          rewards: rewards,
          rareCount: rareCount,
          tag: tag,
        },
        DailyGachaInfo
      );
    } catch (e) {
      console.log(e);
    }
  },

  api: {
    showGachaPool: (req, res) => {
      GachaModel.getDatabasePool().then(pool => res.json(pool));
    },

    updateCharacter: updateCharacter,
    insertCharacter: insertCharacter,
    deleteCharacter: deleteCharacter,
  },
};

function trimParamter(rowData) {
  var objParam = {};

  Object.keys(rowData).forEach(key => {
    if (allowParameter.includes(key.toLocaleLowerCase())) {
      objParam[key] = rowData[key];
    }
  });

  return objParam;
}

async function updateCharacter(req, res) {
  const { id, data } = req.body;
  var result = {};

  try {
    if (id === undefined) throw new GachaException("Parameter id missing", 1);
    if (data === undefined) throw new GachaException("Parameter data missing", 2);

    var objParam = trimParamter(data);

    await GachaModel.updateData(id, objParam);
    res.json({});
  } catch (e) {
    if (!(e instanceof GachaException)) throw e;
    res.status(400);
    result = { message: e.message };
  }

  res.json(result);
}

async function insertCharacter(req, res) {
  const data = req.body;
  var result = {};

  try {
    if (data === undefined) throw new GachaException("Parameter data missing", 2);

    var objParam = trimParamter(data);

    if (Object.keys(objParam).length < 5) throw new GachaException("Parameter Leak", 3);

    await GachaModel.insertNewData(objParam);
  } catch (e) {
    if (!(e instanceof GachaException)) throw e;
    res.status(400);
    result = { message: e.message };
  }

  res.json(result);
}

async function deleteCharacter(req, res) {
  const { id } = req.params;
  var result = {};

  try {
    if (id === undefined) throw new GachaException("Parameter id missing", 1);
    await GachaModel.deleteData(id);
  } catch (e) {
    if (!(e instanceof GachaException)) throw e;
    res.status(400);
    result = { message: e.message };
  }

  res.json(result);
}

async function recordToInventory(userId, rewards) {
  var ids = rewards.map(reward => reward.id);
  var uniqIds = [...new Set(ids)];

  const ownItems = await InventoryModel.fetchUserOwnItems(userId, uniqIds);
  var ownIds = ownItems.map(item => item.itemId);
  var insertIds = ids.filter(id => !ownIds.includes(id));
  insertIds = [...new Set(insertIds)];

  var oldIds = [...ids];
  insertIds.forEach(id => delete oldIds[oldIds.indexOf(id)]);
  oldIds = oldIds.filter(() => true);

  await Promise.all(insertIds.map(id => InventoryModel.insertItem(userId, id, 1)));

  var godStoneArray = oldIds.map(id => {
    let reward = rewards.find(data => data.id === id);
    switch (reward.star) {
      case "1":
        return 1;
      case "2":
        return 10;
      case "3":
        return 50;
      default:
        return 1;
    }
  });

  var GodStoneAmount = 0;

  if (godStoneArray.length !== 0) {
    GodStoneAmount = godStoneArray.reduce((pre, curr) => pre + curr);
    InventoryModel.insertItem(userId, 999, GodStoneAmount);
  }

  var [collectedCount, allCount] = await Promise.all([
    GachaModel.getUserCollectedCharacterCount(userId),
    GachaModel.getPrincessCharacterCount(),
  ]);

  let NewCharacters = insertIds.map(id => rewards.find(reward => reward.id === id));

  return {
    NewCharacters,
    GodStoneAmount,
    collectedCount,
    allCount,
  };
}
