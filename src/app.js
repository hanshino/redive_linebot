const { router, text, platform, route } = require('bottender/router') ;
const { chain } = require('bottender') ;
const character = require('./controller/princess/character');
const gacha = require('./controller/princess/gacha');
const customerOrder = require('./controller/application/CustomerOrder') ;
const setProfile = require('./middleware/profile');

function showState(context) {
    var users = Object.keys(context.state.userDatas).map(key => context.state.userDatas[key].displayName).join('\n') ;

    context.sendText(users) ;
}

/**
 * 基於功能指令優先辨識
 */
function OrderBased(context, { next }) {
    return router([
        text(/^[#\.]角色資訊(\s(?<character>[\s\S]+))?$/, character.getInfo),
        text(/^[#\.]角色技能(\s(?<character>[\s\S]+))?$/, character.getSkill),
        text(/^[#\.](角色)?行動(模式)?(\s(?<character>[\s\S]+))?$/, character.getAction),
        text(/^[#\.](角色)?專武(資訊)?(\s(?<character>[\s\S]+))?$/, character.getUniqueEquip),
        text(/^[#\.](角色)?裝備(需求)?(\s(?<character>[\s\S]+))?$/, character.getEquipRequire),
        text(/^[#\.](公主|角色)(\s(?<character>[\s\S]+))?$/, character.getCharacter),
        text(/^[#\.](角色)?rank(推薦)?(\s(?<character>[\s\S]+))?$/, character.getRecommend),
        text(/^[#\.]抽(\*(?<times>\d+))?(\s*(?<tag>[\s\S]+))?$/, gacha.play),
        text(/^[#\.]新增指令/, (context, props) => customerOrder.insertCustomerOrder(context, props, 1)),
        text(/^[#\.]新增關鍵字指令/, (context, props) => customerOrder.insertCustomerOrder(context, props, 2)),
        text('/state', showState),
        route('*', next),
    ]) ;
}

async function CustomerOrderBased(context, { next }) {
    if (context.isText === false) return next ;

    var detectResult = await customerOrder.CustomerOrderDetect(context) ;

    if (detectResult === false) return next ;
}

function Nothing(context) {

    switch(context.platform) {
        case 'line':
            if (context.event.source.type === 'user') {
                context.sendText('沒有任何符合的指令') ;
            }
        break ;
        case 'telegram':
            if (context.event.message.chat.type === 'private') {
                context.sendText('沒有任何符合的指令') ;
            }
        break ;
    }

    

}

async function App(context) {
    return chain([
        setProfile,
        OrderBased,
        CustomerOrderBased,
        Nothing,
    ]) ;
}

module.exports = App ;