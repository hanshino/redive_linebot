const path = require("path");
const rediveTW = require("../../util/sqlite")(path.join(process.cwd(), "assets", "redive_tw.db"));
const config = require("config");
const { format } = require("util");
const { text } = require("bottender/router");
const i18n = require("../../util/i18n");
const characterTemplate = require("../../templates/princess/Character");
const Inventory = require("../../model/application/Inventory");
const { inventory: inventoryModel } = Inventory;

const showFullRankupManual = context =>
  context.replyText(i18n.__("message.character.full_rank_up_manual"));
const showRankupManual = context => context.replyText(i18n.__("message.character.rank_up_manual"));

exports.router = [
  text(/^[!#/]升星\s(?<name>\S+)$/, rankup),
  text(/^[!#/]升星$/, showRankupManual),
  text(/^[!#/]升滿星\s(?<name>\S+)$/, fullRankup),
  text(/^[!#/]升滿星$/, showFullRankupManual),
];

/**
 * 升滿星
 * @param {import ("bottender").LineContext} context
 * @param {import ("bottender").Props} props
 */
async function fullRankup(context, props) {
  const { name } = props.match.groups;
  const { userId } = context.event.source;
  const message = context.event.message.text;

  const userOwnList = await inventoryModel.getAllUserOwnCharacters(userId);
  const findResult = userOwnList.find(character => character.name === name);
  const filterResult = userOwnList.filter(character => character.name.includes(name));

  if (!findResult && filterResult.length === 0) {
    return context.replyText(i18n.__("message.character.not_found"));
  }

  if (!findResult && filterResult.length > 1) {
    return context.replyText(i18n.__("message.character.multiple_found"));
  }

  const [character] = findResult || filterResult;
  if (character.attributes.find(attr => attr.key === "star").value === 5) {
    return context.replyText(i18n.__("message.character.rank_max"));
  }

  const rankUpCostConfig = config.get("princess.character.rank_up_cost");
  const userMoney = await inventoryModel.getUserMoney(userId);
  const characterStar = character.attributes.find(attr => attr.key === "star").value;
  const cost = rankUpCostConfig
    .filter(cost => cost.rank > characterStar)
    .reduce((acc, cur) => acc + cur.cost * config.get("princess.character.rank_up_cost_rate"), 0);

  if (userMoney.amount < cost) {
    return context.replyText(i18n.__("message.character.not_enough_money"));
  }

  if (!message.startsWith("!")) {
    context.replyFlex(
      "升星確認",
      characterTemplate.generateRankupBubble({
        beforeHeadImage: convertUrl(character.headImage, characterStar),
        afterHeadImage: convertUrl(character.headImage, 5),
        command: "升滿星",
        unitName: character.name,
      })
    );

    return context.replyText(
      i18n.__("message.character.full_rank_up_confirm", {
        cost,
        name: character.name,
      })
    );
  }

  const trx = await inventoryModel.transaction();

  try {
    await inventoryModel.decreaseGodStone({ userId, amount: cost, note: "rank up" });
    const itemAttributes = character.attributes;
    const restAttributes = itemAttributes.filter(attr => attr.key !== "star");
    const newAttributes = [...restAttributes, { key: "star", value: 5 }];
    await inventoryModel.editAttributesByItemId(userId, character.itemId, newAttributes);

    await trx.commit();
  } catch (e) {
    console.error(e);
    trx.rollback();
  }

  context.replyText(
    i18n.__("message.character.full_rank_up_success", {
      name: character.name,
      rank: 5,
    }),
    {
      sender: {
        name: character.name,
        iconUrl: convertUrl(character.headImage, 5),
      },
    }
  );
}

/**
 * 升星
 * @param {import ("bottender").LineContext} context
 * @param {import ("bottender").Props} props
 * @returns {Promise<void>}
 * @throws {Error}
 */
async function rankup(context, props) {
  const { name } = props.match.groups;
  const { userId } = context.event.source;
  const message = context.event.message.text;

  const userOwnList = await inventoryModel.getAllUserOwnCharacters(userId);
  const findResult = userOwnList.find(character => character.name === name);
  const filterResult = userOwnList.filter(character => character.name.includes(name));

  if (!findResult && filterResult.length === 0) {
    return context.replyText(i18n.__("message.character.not_found"));
  }

  if (!findResult && filterResult.length > 1) {
    return context.replyText(i18n.__("message.character.multiple_found"));
  }

  const [character] = findResult || filterResult;
  if (character.attributes.find(attr => attr.key === "star").value === 5) {
    return context.replyText(i18n.__("message.character.rank_max"));
  }

  const rankUpCostConfig = config.get("princess.character.rank_up_cost");
  const userMoney = await inventoryModel.getUserMoney(userId);
  const characterStar = character.attributes.find(attr => attr.key === "star").value;
  const costConfig = rankUpCostConfig.find(cost => cost.rank == characterStar);
  const cost = costConfig.cost * 10;

  if (userMoney.amount < cost) {
    return context.replyText(i18n.__("message.character.not_enough_money"));
  }

  if (!message.startsWith("!")) {
    context.replyFlex(
      "升星確認",
      characterTemplate.generateRankupBubble({
        beforeHeadImage: convertUrl(character.headImage, characterStar),
        afterHeadImage: convertUrl(character.headImage, costConfig.rank + 1),
        command: "升星",
        unitName: character.name,
      })
    );

    return context.replyText(
      i18n.__("message.character.rank_up_confirm", {
        cost,
        name: character.name,
        rank: costConfig.rank + 1,
      })
    );
  }

  const trx = await inventoryModel.transaction();

  try {
    await inventoryModel.decreaseGodStone({ userId, amount: cost, note: "rank up" });
    const itemAttributes = character.attributes;
    const restAttributes = itemAttributes.filter(attr => attr.key !== "star");
    const newAttributes = [...restAttributes, { key: "star", value: costConfig.rank + 1 }];
    await inventoryModel.editAttributesByItemId(userId, character.itemId, newAttributes);

    await trx.commit();
  } catch (e) {
    console.error(e);
    trx.rollback();
  }

  context.replyText(
    i18n.__("message.character.rank_up_success", {
      name: character.name,
      rank: costConfig.rank + 1,
    }),
    {
      sender: {
        name: character.name,
        iconUrl: convertUrl(character.headImage, costConfig.rank + 1),
      },
    }
  );
}

/**
 * 取得角色資料
 * @returns {Promise<{unit_id: number, unit_name: string, rarity: number}[]>}
 */
async function getAllCharacter() {
  return await rediveTW("unit_profile").select("unit_id", "unit_name");
}

function convertUrl(url, rarity) {
  rarity = parseInt(rarity);
  // 如果給的 rarity 是 2 或 4，則推算到最近的合法稀有度
  if (rarity === 2) {
    rarity = 1;
  } else if (rarity === 4 || rarity === 5) {
    rarity = 3;
  }

  // 稀有度只接受 1, 3, 6
  if (![1, 3, 6].includes(rarity)) {
    throw new Error("稀有度必須是 1, 3, 或 6");
  }

  // 找到角色編號部分，假設是以 / 分隔的，並且在最後一個段落
  let parts = url.split("/");
  let fileName = parts[parts.length - 1];

  // 確保 "icon_unit" 不受影響，只修改角色編號部分
  let characterId = fileName.replace("icon_unit_", "").split(".")[0];

  // 修改角色編號的第五碼，假設是從 0 開始的第 4 個字元
  let newCharacterId = characterId.slice(0, 4) + rarity + characterId.slice(5);

  // 構建新的檔案名稱
  let newFileName = "icon_unit_" + newCharacterId + ".png";

  // 替換新的檔案名稱
  parts[parts.length - 1] = newFileName;

  // 返回新的 URL
  let newUrl = parts.join("/");
  return newUrl;
}

async function getCharacterImages() {
  const characters = await getAllCharacter();
  return characters.map(character => {
    const { unit_id: unitId, rarity, unit_name: unitName } = character;
    // 角色圖片編號為角色編號 + 10 * 角色稀有度(3 or 6)
    const picUnitId = unitId + (rarity === 6 ? 6 : 3) * 10;
    return {
      unitId,
      unitName,
      fullImage: format(config.get("princess.character.full_image"), picUnitId),
      headImage: format(config.get("princess.character.head_image"), picUnitId),
    };
  });
}

exports.api = {
  getCharacterImages: (req, res) => getCharacterImages().then(images => res.json(images)),
};
