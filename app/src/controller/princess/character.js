const CharacterModel = require("../../model/princess/character");
const CharacterTemplate = require("../../templates/princess/character");
const error = require("../../util/error");
const { recordSign } = require("../../util/traffic");
const { CustomLogger } = require("../../util/Logger");
const gameSqlite = require("../../model/princess/GameSqlite");
const path = require("path");
const { sample } = require("lodash");
const rediveTW = require("../../util/sqlite")(
  path.join(process.cwd(), "assets", "redive_tw.db")
);
const rediveJP = require("../../util/sqlite")(
  path.join(process.cwd(), "assets", "redive_jp.db")
);
const config = require("config");
const { format } = require("util");

/**
 * 取得角色資料
 * @returns {Promise<{unit_id: number, unit_name: string, rarity: number}[]>}
 */
async function getAllCharacter() {
  const twChatacters = await rediveTW("unit_profile").select(
    "unit_id",
    "unit_name"
  );

  return twChatacters;
}

function getCharacterByNick(nick) {
  var datas = CharacterModel.getDatas();

  var result = datas.find((data) => {
    let aryNick =
      data.Nick === undefined || data.Nick.trim() === ""
        ? [data.Name]
        : data.Nick.split(",").concat([data.Name]);
    let re = new RegExp("^(" + aryNick.join("|") + ")$");
    return re.test(nick);
  });

  return result !== undefined ? result.Name : false;
}

function getCharacterData(name) {
  name = name.replace(/\s+/g, "").replace("(", "（").replace(")", "）");

  var character = getCharacterByNick(name);
  if (character === false) throw "找無此角色";

  var datas = CharacterModel.getDatas();
  var result = datas.find((data) => {
    return data.Name == character;
  });

  if (result == undefined) throw "找無此角色";

  result.Info = _getCharacterInfoPara(result);

  return result;
}

function _getCharacterInfoPara(characterData) {
  return {
    Image: characterData.Image,
    Name: characterData.Info["角色名字"],
    Guild: characterData.Info["公會"],
    Birthday: characterData.Info["生日"],
    Age: characterData.Info["年齡"],
    Height: characterData.Info["身高"],
    Weight: characterData.Info["體重"],
    Blood: characterData.Info["血型"],
    Class: characterData.Info["種族"],
    Habit: characterData.Info["喜好"],
    CV: characterData.Info["聲優"],
  };
}

async function getCharacterImages() {
  const characters = await getAllCharacter();
  return characters.map((character) => {
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

module.exports = {
  getInfo: function (context, { match }) {
    recordSign("getInfo");
    const { character } = match.groups;

    try {
      if (character === undefined) throw `📖使用方式：${match[0]} 布丁`;

      var data = getCharacterData(character);

      CharacterTemplate[context.platform].showInfo(context, character, data);
    } catch (e) {
      CustomLogger.info(e);
      error.sendError(context, e);
    }
  },

  getSkill: function (context, { match }) {
    recordSign("getSkill");
    const { character } = match.groups;

    try {
      if (character === undefined) throw `📖使用方式：${match[0]} 布丁`;

      var data = getCharacterData(character);

      CharacterTemplate[context.platform].showSkill(context, character, data);
    } catch (e) {
      CustomLogger.info(e);
      error.sendError(context, e);
    }
  },

  getAction: function (context, { match }) {
    recordSign("getAction");
    const { character } = match.groups;

    try {
      if (character === undefined) throw `📖使用方式：${match[0]} 布丁`;

      var data = getCharacterData(character);

      CharacterTemplate[context.platform].showAction(context, character, data);
    } catch (e) {
      CustomLogger.info(e);
      error.sendError(context, e);
    }
  },

  getUniqueEquip: function (context, { match }) {
    recordSign("getUniqueEquip");
    const { character } = match.groups;

    try {
      if (character === undefined) throw `📖使用方式：${match[0]} 布丁`;

      var data = getCharacterData(character);
      var { Unique, Name } = data;
      Unique.Character = Name;
      if (Object.prototype.hasOwnProperty.call(Unique, "Name") === false)
        throw "此角色尚未擁有專屬武器";

      CharacterTemplate[context.platform].showUniqEquip(
        context,
        character,
        Unique
      );
    } catch (e) {
      CustomLogger.info(e);
      error.sendError(context, e);
    }
  },

  getEquipRequire: function (context, { match }) {
    recordSign("getEquipRequire");
    const { character } = match.groups;

    try {
      if (character === undefined) throw `📖使用方式：${match[0]} 布丁`;

      var data = getCharacterData(character);

      CharacterTemplate[context.platform].showEquipRequire(
        context,
        character,
        data
      );
    } catch (e) {
      CustomLogger.info(e);
      error.sendError(context, e);
    }
  },

  getCharacter: function (context, { match }) {
    recordSign("getCharacter");
    const { character } = match.groups;

    try {
      if (character === undefined) throw `📖使用方式：${match[0]} 布丁`;

      var data = getCharacterData(character);

      CharacterTemplate[context.platform].showCharacter(
        context,
        character,
        data
      );
    } catch (e) {
      CustomLogger.info(e);
      error.sendError(context, e);
    }
  },

  /**
   * 戳一下角色
   * @param {import ("bottender").LineContext} context
   */
  pingCharacter: async function (context, { match }) {
    const { character } = match.groups;

    try {
      if (character === undefined) throw `📖使用方式：${match[0]} 布丁`;

      let data = getCharacterData(character);
      const { unitId } = data;
      const comments = await gameSqlite("room_unit_comments")
        .select("description")
        .union(function () {
          this.select("description")
            .from("unit_comments")
            .where("unit_id", unitId);
        })
        .where({ unit_id: unitId });

      if (comments.length === 0) {
        throw `查無此角色的語音包：${character}`;
      }

      const desc = sample(comments.map((c) => c.description));

      context.replyText(desc.replace(/\\n/g, "\n"), {
        sender: {
          name: data.Name,
          iconUrl: data.HeadImage,
        },
      });
    } catch (e) {
      CustomLogger.info(e);
      error.sendError(context, e);
    }
  },

  api: {
    getCharacterImages: (req, res) =>
      getCharacterImages().then((images) => res.json(images)),
  },
};
