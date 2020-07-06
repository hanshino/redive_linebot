const CharacterModel = require('../../model/princess/character') ;
const CharacterTemplate = require('../../templates/princess/character') ;
const { line } = require('bottender/router');
const error = require('../../util/error');

function getCharacterByNick(nick)
{
    var datas = CharacterModel.getDatas() ;

    var result = datas.find(data => {
        let aryNick = (data.Nick === undefined || data.Nick.trim() === '') ? [data.Name] : data.Nick.split(',').concat([data.Name]) ;
        let re = new RegExp('^(' + aryNick.join('|') + ')$') ;
        return re.test(nick) ;
    }) ;

    return (result !== undefined) ? result.Name : false ;
}

function getCharacterData(name)
{
    name = name.replace(/\s+/g, '').replace('(', '（').replace(')', '）') ;

    var character = getCharacterByNick(name) ;
    if (character === false) throw '找無此角色' ;

    var datas = CharacterModel.getDatas() ;
    var result = datas.find(data => {return data.Name == character ;}) ;

    if (result == undefined) throw '找無此角色' ;

    result.Info = _getCharacterInfoPara(result) ;

    return result ;
}

function _getCharacterInfoPara(characterData)
{
    return {
        Image       : characterData.Image,
        Name        : characterData.Info['名字'],
        Guild       : characterData.Info['公會'],
        Birthday    : characterData.Info['生日'],
        Age         : characterData.Info['年齡'],
        Height      : characterData.Info['身高'],
        Weight      : characterData.Info['體重'],
        Blood       : characterData.Info['血型'],
        Class       : characterData.Info['種族'],
        Habit       : characterData.Info['喜好'],
        CV          : characterData.Info['聲優'],
    }
}

module.exports = {

    getInfo : function(context, { match }) {
        const { character } = match.groups ;

        try
        {
            if (character === undefined) throw `📖使用方式：${match[0]} 布丁` ;

            var data = getCharacterData(character) ;

            CharacterTemplate[context.platform].showInfo(context, character, data) ;
        }
        catch(e)
        {
            console.log(e) ;
            error.sendError(context, e) ;
        }
    },

    getSkill : function(context, { match }) {
        const { character } = match.groups ;

        try
        {
            if (character === undefined) throw `📖使用方式：${match[0]} 布丁` ;

            var data = getCharacterData(character) ;

            CharacterTemplate[context.platform].showSkill(context, character, data) ;
        }
        catch(e)
        {
            console.log(e) ;
            error.sendError(context, e) ;
        }
    },

    getAction : function(context, { match }) {
        const { character } = match.groups ;

        try
        {
            if (character === undefined) throw `📖使用方式：${match[0]} 布丁` ;

            var data = getCharacterData(character) ;

            CharacterTemplate[context.platform].showAction(context, character, data) ;
        }
        catch(e)
        {
            console.log(e) ;
            error.sendError(context, e) ;
        }
    },

    getUniqueEquip : function(context, { match }) {
        const { character } = match.groups ;

        try
        {
            if (character === undefined) throw `📖使用方式：${match[0]} 布丁` ;

            var data = getCharacterData(character) ;
            var { Unique, Name } = data ;
            Unique.Character = Name ;
            if (Unique.hasOwnProperty('Name') === false) throw '此角色尚未擁有專屬武器' ;

            CharacterTemplate[context.platform].showUniqEquip(context, character, Unique) ;
        }
        catch(e)
        {
            console.log(e) ;
            error.sendError(context, e) ;
        }
    },

    getEquipRequire : function(context, { match }) {
        const { character } = match.groups ;

        try
        {
            if (character === undefined) throw `📖使用方式：${match[0]} 布丁` ;

            var data = getCharacterData(character) ;

            CharacterTemplate[context.platform].showEquipRequire(context, character, data) ;
        }
        catch(e)
        {
            console.log(e) ;
            error.sendError(context, e) ;
        }
    },

    getCharacter : function(context, { match }) {
        const { character } = match.groups ;

        try
        {
            if (character === undefined) throw `📖使用方式：${match[0]} 布丁` ;

            var data = getCharacterData(character) ;

            CharacterTemplate[context.platform].showCharacter(context, character, data) ;
        }
        catch(e)
        {
            console.log(e) ;
            error.sendError(context, e) ;
        }
    },

    getRecommend : async function(context, { match }) {
        const { character } = match.groups ;

        try
        {
            if (character === undefined) throw `📖使用方式：${match[0]} 布丁` ;

            var data = getCharacterData(character) ;
            var recommendData = await CharacterModel.getRecommendDatas() ;
            let aryName = [] ;

            if (data.hasOwnProperty('Nick')) {
                aryName = data.Nick.split(',') ;
            }

            aryName.push(data.Name) ;

            var recommendResult = recommendData.find(data => aryName.indexOf(data['角色']) !== -1) ;

            if (recommendResult === undefined) throw `查無${character}的推薦資料` ;

            CharacterTemplate[context.platform].showRecommend(context, character, {
                characterData : data,
                recommendData : recommendResult
            }) ;
        }
        catch(e)
        {
            console.log(e) ;
            error.sendError(context, e) ;
        }
    },
}