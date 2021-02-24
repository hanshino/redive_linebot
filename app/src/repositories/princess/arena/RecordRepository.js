const ArenaModel = require("../../../model/princess/arena");
const CharacterModel = require("../../../model/princess/character");
const md5 = require("md5");

exports.insert = async params => {
  let { left, right, userId, sourceId } = params;
  let option = {
    left_hash: genTeamHash(left.team),
    right_hash: genTeamHash(right.team),
    left_team: JSON.stringify(left.team.map(genTeamMember)),
    right_team: JSON.stringify(right.team.map(genTeamMember)),
    left_result: left.result === 1 ? "1" : "0",
    right_result: right.result === 1 ? "1" : "0",
    left_type: "2",
    right_type: "1",
    author_id: userId,
    source_id: sourceId,
    is_share: "1",
  };

  return await ArenaModel.insertRecrod(option);
};

exports.index = async team => {};

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
