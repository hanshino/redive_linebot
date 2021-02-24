const ArenaModel = require("../../../model/princess/arena");
const CharacterModel = require("../../../model/princess/character");
const md5 = require("md5");

/**
 * 記錄新增，並且自動新增一筆"讚"紀錄
 * @param {Object} params
 * @param {Object} params.left
 * @param {Array} params.left.team
 * @param {Number} params.left.result
 * @param {Object} params.right
 * @param {Array} params.right.team
 * @param {Number} params.right.result
 * @param {String}  params.userId
 * @param {String}  params.sourceId
 */
exports.insert = async params => {
  let { left, right, userId, sourceId, type } = params;
  let left_hash = genTeamHash(left.team),
    right_hash = genTeamHash(right.team);

  let left_type, right_type;

  if (type === "1") {
    left_type = "1";
    right_type = "2";
  } else {
    left_type = "2";
    right_type = "1";
  }

  let option = {
    left_hash,
    right_hash,
    left_team: JSON.stringify(left.team.map(genTeamMember)),
    right_team: JSON.stringify(right.team.map(genTeamMember)),
    left_result: left.result === 1 ? "1" : "0",
    right_result: right.result === 1 ? "1" : "0",
    left_type,
    right_type,
    author_id: userId,
    source_id: sourceId,
    is_share: "1",
  };

  let insertAffected = await ArenaModel.insertRecrod(option);

  // 上傳紀錄便進行按讚，防守方贏的話此紀錄unlike，輸的話like
  let attackHash, defenseHash, isDefenseLose, mergeHash;
  if (option.left_type === "1") {
    attackHash = left_hash;
    defenseHash = right_hash;
    isDefenseLose = option.right_result === "0" ? true : false;
  } else {
    attackHash = right_hash;
    defenseHash = left_hash;
    isDefenseLose = option.left_result === "0" ? true : false;
  }

  mergeHash = md5(`${attackHash}${defenseHash}`);

  await ArenaModel.insertLikeRecord({
    mergeHash,
    attackHash,
    defenseHash,
    userId,
    type: isDefenseLose ? 1 : 2,
    upload: true,
  });

  return insertAffected !== false ? true : false;
};

/**
 * 查詢解陣隊伍
 * @param {Array<{unit_id: String}>} team
 */
exports.index = async team => {
  let ids = team.map(char => char.unit_id).sort();
  let hash = md5(ids.join(""));

  let rows = await ArenaModel.search(hash);

  // 整理準備獲取讚數
  let hashDatas = genMergeHashData(rows);
  let [likeRecords, unlikeRecords] = await Promise.all([
    ArenaModel.queryLikeData(Object.keys(hashDatas)),
    ArenaModel.queryUnlikeData(Object.keys(hashDatas)),
  ]);

  likeRecords.forEach(record => {
    console.log(record.merge_hash);
    console.log(hashDatas);
    hashDatas[record.merge_hash].like = record.count;
  });

  unlikeRecords.forEach(record => {
    hashDatas[record.merge_hash].unlike = record.count;
  });

  return rows.map(row => {
    let images = [];
    let hash;
    if (row.left_result === "1") {
      images = genTeamImages(row.left_team);
    } else {
      images = genTeamImages(row.right_team);
    }

    let { left_hash, right_hash } = row;
    hash =
      row.left_type === "1"
        ? genMergeHash(left_hash, right_hash)
        : genMergeHash(right_hash, left_hash);

    let { like, unlike } = hashDatas[hash];

    return { like, unlike, images };
  });
};

exports.genTeamImages = genTeamImages;

/**
 * 排序後，進行角色頭像產出
 * @param {Array<{unitId: Number, rarity: Number}>} team
 */
function genTeamImages(team) {
  let characters = team.map(char => ({ ...CharacterModel.find(char.unitId), ...char }));
  characters.sort((a, b) => b.Stand - a.Stand);
  return characters.map(char => CharacterModel.getHeadImage(char.unitId, char.rarity));
}

/**
 * 將隊伍組成進行hash
 * @param {Array<{unit_id: Number}>} characters
 */
function genTeamHash(characters) {
  let ids = characters.map(char => char.unit_id).sort();
  return md5(ids.join(""));
}

function genTeamMember(member) {
  return { unitId: member.unit_id, rarity: member.rarity };
}

function genMergeHashData(rows) {
  let hashDatas = {};
  rows.forEach(row => {
    let data = { like: 0, unlike: 0 };
    let attack_hash, defense_hash;
    if (row.left_type === "1") {
      attack_hash = row.left_hash;
      defense_hash = row.right_hash;
    } else {
      defense_hash = row.left_hash;
      attack_hash = row.right_hash;
    }

    let mergeHash = genMergeHash(attack_hash, defense_hash);
    hashDatas[mergeHash] = data;
  });

  return hashDatas;
}

function genMergeHash(attackHash, defenseHash) {
  return md5(`${attackHash}${defenseHash}`);
}
