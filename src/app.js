const { router, text } = require('bottender/router') ;
const character = require('./controller/princess/character');
const gacha = require('./controller/princess/gacha');

async function App(context) {
    return router([
        text(/^[#\.]角色資訊(\s(?<character>[\s\S]+))?$/, character.getInfo),
        text(/^[#\.]角色技能(\s(?<character>[\s\S]+))?$/, character.getSkill),
        text(/^[#\.](角色)?行動(模式)?(\s(?<character>[\s\S]+))?$/, character.getAction),
        text(/^[#\.](角色)?專武(資訊)?(\s(?<character>[\s\S]+))?$/, character.getUniqueEquip),
        text(/^[#\.](角色)?裝備(需求)?(\s(?<character>[\s\S]+))?$/, character.getEquipRequire),
        text(/^[#\.](公主|角色)(\s(?<character>[\s\S]+))?$/, character.getCharacter),
        text(/^[#\.](角色)?rank(推薦)?(\s(?<character>[\s\S]+))?$/, character.getRecommend),
        text(/^[\.#]抽(\*(?<times>\d+))?(\s*(?<tag>[\s\S]+))?$/, gacha.play),
    ]) ;
}

module.exports = App ;