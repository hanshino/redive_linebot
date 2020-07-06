const strCharacterInfoTPL = JSON.stringify({ "type": "bubble", "hero": { "type": "image", "url": "{CharacterImage}", "size": "full", "aspectRatio": "20:13", "aspectMode": "cover" }, "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "{Name}", "weight": "bold", "size": "xl" }, { "type": "box", "layout": "vertical", "margin": "lg", "spacing": "md", "contents": [{ "type": "box", "layout": "baseline", "spacing": "md", "contents": [{ "type": "text", "text": "公會", "color": "#aaaaaa", "size": "md", "flex": 1 }, { "type": "text", "text": "{Guild}", "wrap": true, "color": "#666666", "size": "md", "flex": 5 }] }, { "type": "box", "layout": "horizontal", "contents": [{ "type": "box", "layout": "baseline", "spacing": "md", "flex": 1, "contents": [{ "type": "text", "text": "生日", "color": "#aaaaaa", "size": "md", "flex": 1 }, { "type": "text", "text": "{Birthday}", "wrap": true, "color": "#666666", "size": "md", "flex": 2 }] }, { "type": "box", "layout": "baseline", "spacing": "md", "flex": 1, "contents": [{ "type": "text", "text": "年齡", "color": "#aaaaaa", "size": "md", "flex": 1 }, { "type": "text", "text": "{Age}", "wrap": true, "color": "#666666", "size": "md", "flex": 2 }] }] }, { "type": "box", "layout": "horizontal", "contents": [{ "type": "box", "layout": "baseline", "spacing": "md", "contents": [{ "type": "text", "text": "身高", "color": "#aaaaaa", "size": "md", "flex": 1 }, { "type": "text", "text": "{Height}", "wrap": true, "color": "#666666", "size": "md", "flex": 2 }] }, { "type": "box", "layout": "baseline", "spacing": "md", "contents": [{ "type": "text", "text": "體重", "color": "#aaaaaa", "size": "md", "flex": 1 }, { "type": "text", "text": "{Weight}", "wrap": true, "color": "#666666", "size": "md", "flex": 2 }] }] }, { "type": "box", "layout": "horizontal", "contents": [{ "type": "box", "layout": "baseline", "spacing": "md", "contents": [{ "type": "text", "text": "血型", "color": "#aaaaaa", "size": "md", "flex": 1 }, { "type": "text", "text": "{Blood}", "wrap": true, "color": "#666666", "size": "md", "flex": 2 }] }, { "type": "box", "layout": "baseline", "spacing": "md", "contents": [{ "type": "text", "text": "種族", "color": "#aaaaaa", "size": "md", "flex": 1 }, { "type": "text", "text": "{Class}", "wrap": true, "color": "#666666", "size": "md", "flex": 2 }] }] }, { "type": "box", "layout": "baseline", "spacing": "md", "contents": [{ "type": "text", "text": "喜好", "color": "#aaaaaa", "size": "md", "flex": 1 }, { "type": "text", "text": "{Habit}", "wrap": true, "color": "#666666", "size": "md", "flex": 5 }] }, { "type": "box", "layout": "baseline", "spacing": "md", "contents": [{ "type": "text", "text": "聲優", "color": "#aaaaaa", "size": "md", "flex": 1 }, { "type": "text", "text": "{CV}", "wrap": true, "color": "#666666", "size": "md", "flex": 5 }] }] }] } });
const strRowEquipRequireTPL = JSON.stringify({ "type": "box", "layout": "horizontal", "contents": [{ "type": "text", "text": "{Rank}", "weight": "bold", "color": "#007bff", "gravity": "center", "flex": 1 }, { "type": "image", "url": "{ImageOne}", "size": "xxs", "flex": 1, "margin": "xs" }, { "type": "image", "url": "{ImageTwo}", "size": "xxs", "flex": 1, "margin": "xs" }, { "type": "image", "url": "{ImageThree}", "size": "xxs", "flex": 1, "margin": "xs" }, { "type": "image", "url": "{ImageFour}", "size": "xxs", "flex": 1, "margin": "xs" }, { "type": "image", "url": "{ImageFive}", "size": "xxs", "flex": 1 }, { "type": "image", "url": "{ImageSix}", "size": "xxs", "flex": 1, "margin": "xs" }] });
const strEquipRequireTPL = JSON.stringify({ "type": "bubble", "header": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "{Title}", "weight": "bold", "color": "#1DB446", "wrap": true }] }, "body": { "type": "box", "layout": "vertical", "spacing": "sm", "contents": [] } });
const strUniqueEquipTPL = JSON.stringify({ "type": "bubble", "body": { "type": "box", "layout": "vertical", "spacing": "sm", "contents": [{ "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "資料來自：蘭德索爾圖書館", "size": "xxs", "color": "#1DB446", "wrap": true }] }, { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "{Character}的專武", "weight": "bold", "color": "#1DB446", "size": "md", "wrap": true }] }, { "type": "image", "url": "{Image}", "size": "md", "flex": 1, "margin": "lg" }, { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "{Name}", "weight": "bold", "color": "#1DB446", "size": "lg", "wrap": true }] }, { "type": "box", "layout": "horizontal", "contents": [{ "type": "text", "text": "屬性", "size": "sm", "color": "#555555", "flex": 1 }, { "type": "text", "text": "{Status}", "size": "sm", "color": "#111111", "flex": 5, "wrap": true }] }, { "type": "box", "layout": "horizontal", "contents": [{ "type": "text", "text": "描述", "size": "sm", "color": "#555555", "flex": 1 }, { "type": "text", "text": "{Description}", "size": "sm", "color": "#111111", "flex": 5, "wrap": true }] }] } });
const strSkillTPL = JSON.stringify({ "type": "bubble", "body": { "type": "box", "layout": "vertical", "spacing": "sm", "contents": [{ "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "資料來自：蘭德索爾圖書館", "size": "xxs", "color": "#1DB446", "wrap": true }] }, { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "{Name}的技能", "weight": "bold", "color": "#1DB446", "size": "md", "wrap": true }] }] } });
const strActionTPL = JSON.stringify({ "type": "bubble", "body": { "type": "box", "layout": "vertical", "spacing": "sm", "contents": [{ "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "資料來自：蘭德索爾圖書館", "size": "xxs", "color": "#1DB446", "wrap": true }] }, { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "{Name}的攻擊模式", "weight": "bold", "color": "#1DB446", "size": "md", "wrap": true }] }] } });
const strSkillInfoTPL = JSON.stringify({ "type": "bubble", "body": { "type": "box", "layout": "vertical", "spacing": "sm", "contents": [{ "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "資料來自：蘭德索爾圖書館", "size": "xxs", "color": "#1DB446", "wrap": true }] }, { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "{Character}的技能說明", "weight": "bold", "color": "#1DB446", "size": "md", "wrap": true }] }, { "type": "image", "url": "{Image}", "size": "md", "flex": 1, "margin": "lg" }, { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "{Name}", "weight": "bold", "color": "#1DB446", "size": "lg", "wrap": true }] }, { "type": "box", "layout": "horizontal", "contents": [{ "type": "text", "text": "類型", "size": "sm", "color": "#555555", "flex": 1 }, { "type": "text", "text": "{Type}", "size": "sm", "color": "#111111", "flex": 5, "wrap": true }] }, { "type": "box", "layout": "horizontal", "contents": [{ "type": "text", "text": "效果", "size": "sm", "color": "#555555", "flex": 1 }, { "type": "text", "text": "{Effect}", "size": "sm", "color": "#111111", "flex": 5, "wrap": true }] }, { "type": "box", "layout": "horizontal", "contents": [{ "type": "text", "text": "描述", "size": "sm", "color": "#555555", "flex": 1 }, { "type": "text", "text": "{Description}", "size": "sm", "color": "#111111", "flex": 5, "wrap": true }] }] } });
const noEquipURL = 'https://pcredivewiki.tw/static/images/equipment/icon_equipment_999999.png';
const common = require('../../common');

function getRecommend({characterData, recommendData}) {
    let cover = {"type":"bubble","hero":{"type":"image","url":"{image}","size":"full","position":"relative","aspectMode":"fit","aspectRatio":"16:9"},"body":{"type":"box","layout":"vertical","contents":[{"type":"text","contents":[{"type":"span","text":"Rank推薦："},{"type":"span","text":"{rank}","color":"#FF4500"}]},{"type":"text","contents":[{"type":"span","text":"備註："},{"type":"span","text":"{note}"}],"wrap":true}]},"footer":{"type":"box","layout":"vertical","contents":[{"type":"text","text":"by 煌靈","size":"xxs","align":"end","color":"#2e856e"}]}} ;
    let content = {"type":"bubble","body":{"type":"box","layout":"vertical","contents":[{"type":"text","text":"此次數據差異","size":"lg"},{"type":"separator","color":"#000000","margin":"md"}],"spacing":"xs"}} ;
    let valueTPL = {"type":"box","layout":"horizontal","contents":[{"type":"text","text":"{title}","weight":"bold","size":"sm"},{"type":"text","text":"{value}","align":"end","size":"sm"}]} ;

    let coverBubble = JSON.parse(common.assemble({
        image : characterData.Image,
        rank  : recommendData['RANK推薦'],
        note : recommendData['備註'] || '無',
    }, JSON.stringify(cover))) ;

    let contentBubble = JSON.parse(JSON.stringify(content)) ;

    Object.keys(recommendData).forEach(key => {
        if (['角色', 'RANK推薦', '備註'].indexOf(key) !== -1) return ;
        if (recommendData[key] === 0) return ;
        let objValue = JSON.parse(common.assemble({
            title : key,
            value : recommendData[key].toString()
        }, JSON.stringify(valueTPL))) ;

        if (recommendData[key] > 0)
        {
            objValue.contents[1].color = "#4B8B3B" ;
        }
        else
        {
            objValue.contents[1].color = "#9B1C31" ;
        }

        contentBubble.body.contents.push(objValue) ;
    }) ;

    contentBubble.body.contents[2].margin = "lg" ;

    return {
        type : 'carousel',
        contents : [
            coverBubble,
            contentBubble,
        ]
    }
}

/**
 * 取得角色詳細資料畫面
 * @param {Object} objData 直接傳入角色資訊物件即可
 */
function getCharacterInfo(objData) {
    var mapData = {
        CharacterImage: objData.Image,
        Name: objData.Name,
        Guild: objData.Guild,
        Birthday: objData.Birthday,
        Age: objData.Age,
        Height: objData.Height,
        Weight: objData.Weight,
        Blood: objData.Blood,
        Class: objData.Class,
        Habit: objData.Habit,
        CV: objData.CV
    };

    return JSON.parse(common.assemble(mapData, strCharacterInfoTPL));
}

/**
 * 取得裝備需求畫面
 * @param   {Object}    objData
 * @param   {String}    objData.Name
 * @param   {Array}     objData.Equips  max length : 5
 */
function getEquipRequire(objData) {
    let separator = { "type": "separator", "color": "#000000", "margin": "sm" };

    var { Name: characterName, Equips: equipDatas } = objData;

    equipDatas = equipDatas.slice(0, 5);

    let mapData = {
        Title: characterName + '的裝備需求',
    };

    let contents = [];

    equipDatas.forEach(data => {
        let equips = data.Equips;

        let rowMapData = {
            Rank: 'R' + (data.Rank),
            ImageOne: (equips.length > 0) ? equips[0].Image : noEquipURL,
            ImageTwo: (equips.length > 1) ? equips[1].Image : noEquipURL,
            ImageThree: (equips.length > 2) ? equips[2].Image : noEquipURL,
            ImageFour: (equips.length > 3) ? equips[3].Image : noEquipURL,
            ImageFive: (equips.length > 4) ? equips[4].Image : noEquipURL,
            ImageSix: (equips.length > 5) ? equips[5].Image : noEquipURL,
        };

        contents.push(JSON.parse(common.assemble(rowMapData, strRowEquipRequireTPL)));
        contents.push(separator);
    });

    contents.pop();

    let bubbleMessage = JSON.parse(common.assemble(mapData, strEquipRequireTPL));
    bubbleMessage.body.contents = contents;

    return bubbleMessage;
}

/**
 * 取得專屬武器畫面
 * @param {Object} objUnique
 * @param {String} objUnique.Character
 * @param {String} objUnique.Name
 * @param {String} objUnique.Description
 * @param {String} objUnique.Image
 * @param {Array} objUnique.Status
 * @param {Array} objUnique.Status.title
 * @param {Array} objUnique.Status.value
 */
function getUniqueEquip(objUnique) {
    let mapData = {
        Character: objUnique.Character,
        Name: objUnique.Name,
        Description: objUnique.Description,
        Image: objUnique.Image,
    }

    let aryStatus = objUnique.Status.map(data => {
        return data.title + '：' + data.value;
    });

    mapData.Status = aryStatus.join('\\n');

    return JSON.parse(common.assemble(mapData, strUniqueEquipTPL));
}

/**
 * 取得技能概覽頁面
 * @param {Object} objSkill 技能資訊物件{Name, Skills:[]}
 */
function getSkills(objSkill) {
    let bubbleMessage = JSON.parse(common.assemble({ Name: objSkill.Name }, strSkillTPL));
    let { Skills } = objSkill;

    if (objSkill.Name == undefined) throw '未傳入角色名稱，看到這個請通知作者...';

    Skills.forEach(data => {
        let row = _getSkillRow(data)
        bubbleMessage.body.contents.push(row);
        bubbleMessage.body.contents.push({ "type": "separator", "color": "#000000" })
    });

    bubbleMessage.body.contents.pop();

    return bubbleMessage;
}

/**
 * 取得行動模式頁面
 * @param {Object} objAction 行動模式資訊物件{Name, Action:{Start:[], Loop:[]}}
 */
function getAction(objAction) {
    var bubbleMessage = JSON.parse(common.assemble({ Name: objAction.Name }, strActionTPL));
    let strArrow = JSON.stringify({ "type": "text", "text": "→", "size": "lg", "align": "center", "gravity": "center", "flex": 1, "margin": "xs" });
    let strImage = JSON.stringify({ "type": "image", "url": "{Image}", "size": "xxs", "flex": 1, "margin": "xs" });
    let strTitle = JSON.stringify({ "type": "text", "text": "{Title}", "weight": "bold", "color": "#007bff", "gravity": "center", "flex": 1 });

    let startBox = {
        type: 'box',
        layout: 'horizontal',
        contents: []
    };

    bubbleMessage.body.contents.push(JSON.parse(common.assemble({ Title: '起手' }, strTitle)));

    objAction.Action.Start.forEach((imgUrl, index) => {
        startBox.contents.push(JSON.parse(common.assemble({ Image: imgUrl }, strImage)));

        if (startBox.contents.length >= 5) {
            bubbleMessage.body.contents.push(JSON.parse(JSON.stringify(startBox)));
            startBox.contents = [];
            //{type:'filler'}
        }

        if (index + 1 !== objAction.Action.Start.length) {
            startBox.contents.push(JSON.parse(strArrow));
        }
    });

    if (startBox.contents.length !== 0) {
        bubbleMessage.body.contents.push(startBox);
    }

    bubbleMessage.body.contents.push({ "type": "separator", "color": "#000000" });

    let loopBox = {
        type: 'box',
        layout: 'horizontal',
        contents: []
    };

    bubbleMessage.body.contents.push(JSON.parse(common.assemble({ Title: '循環' }, strTitle)));

    objAction.Action.Loop.forEach((imgUrl, index) => {
        loopBox.contents.push(JSON.parse(common.assemble({ Image: imgUrl }, strImage)));

        if (loopBox.contents.length >= 5) {
            bubbleMessage.body.contents.push(JSON.parse(JSON.stringify(loopBox)));
            loopBox.contents = [];
        }

        if (index + 1 !== objAction.Action.Loop.length) {
            loopBox.contents.push(JSON.parse(strArrow));
        }
    });

    if (loopBox.contents.length !== 0) {
        bubbleMessage.body.contents.push(JSON.parse(JSON.stringify(loopBox)));
    }

    return bubbleMessage;
}

/**
 * 取得技能詳細頁面
 * @param {Object} objSkill 技能資訊物件{Name, Data}
 */
function getSkillInfo(objSkill) {
    var { Name: CharacterName, Data: Data } = objSkill;

    let mapData = {
        Character: CharacterName,
        Name: Data.name,
        Image: Data.image,
        Type: Data.type,
        Description: Data.description,
        Effect: Data.effect.join('\n').replace(/\s+/g, ''),
    };

    return JSON.parse(common.assemble(mapData, strSkillInfoTPL));
}

function _getSkillRow(objData)
{
    let strTemplate = JSON.stringify({"type":"box","layout":"horizontal","contents":[{"type":"image","url":"{Image}","size":"xxs","flex":1,"margin":"xs"},{"type":"box","layout":"vertical","flex":3,"contents":[{"type":"text","text":"{Type}","weight":"bold","color":"{Color}"},{"type":"text","text":"{Name}","wrap":true}]}]}) ;

    let typeColor = {
        '必殺技+' : '#c45b39',
        '必殺技' : '#c45b39',
        '技能1' : '#feb645',
        '技能2' : '#feb645',
        'EX技能' : '#207ce5',
        'EX技能+' : '#207ce5',
        '專武強化技能' : '#feb645',
        '專武強化技能1' : '#feb645'
    } ;

    let mapData = {
        Name : objData.name,
        Image : objData.image,
        Type : objData.type,
        Color : typeColor[objData.type],
    }

    return JSON.parse(common.assemble(mapData, strTemplate)) ;
}

function _chunkER(characterData)
{
    var Equips = [] ;
    let start = 0, step = 5 ;

    while(start < characterData.Equip.length)
    {
        Equips.push(characterData.Equip.slice(start, start + step)) ;
        start += step ;
    }

    return Equips ;
}

module.exports = {
    /**
     * 顯示角色資訊
     * @param {LineContext} context 
     * @param {String} name 角色姓名
     * @param {Object} objData 角色包
     */
    showInfo : function(context, name, objData) {
        context.sendFlex(`${name}的資訊`, getCharacterInfo(objData.Info)) ;
    },

    showSkill : function(context, name, objData) {

        var bubbleMessages = [] ;

        bubbleMessages.push(getSkills({
            Name : name,
            Skills : objData.Skill
        })) ;

        objData.Skill.forEach(data => {
            bubbleMessages.push(getSkillInfo({
                Name : name,
                Data : data
            })) ;
        }) ;

        context.sendFlex(`${name}的技能一覽`, {
            type : 'carousel',
            contents : bubbleMessages,
        }) ;
    },

    showAction : function(context, name, objData) {
        context.sendFlex(`${name}的行動模式`, getAction(objData)) ;
    },

    showUniqEquip : function(context, name, unique) {
        context.sendFlex(`${name}的專武資訊`, getUniqueEquip(unique)) ;
    },

    /**
     * 輸出裝備需求訊息
     * @param {LineContext} context 
     * @param {String} name character name
     * @param {Object} objData
     */
    showEquipRequire : function(context, name, objData) {
        var chunkEquip = _chunkER(objData) ;
        var contents = {} ;

        if (chunkEquip.length == 1) {
            contents = getEquipRequire({Name : name, Equips : chunkEquip[0]}) ;
        } else {
            contents = {
                type : 'carousel',
                contents : [],
            } ;

            chunkEquip.forEach(equip => {
                contents.contents.push(getEquipRequire({
                    Name : name,
                    Equips : equip
                }))
            }) ;
        }

        context.sendFlex(`${name}的裝備需求清單`, contents) ;
    },

    showCharacter : function(context, name, objData) {
        var contents = {
            type : 'carousel',
            contents : [
                getCharacterInfo(objData.Info),
                getSkills({Name : name, Skills : objData.Skill}),
                getAction({Name : name, Action : objData.Action}),
            ]
        } ;

        var { Unique, Name } = objData ;
        Unique.Character = Name ;
        if (Unique.hasOwnProperty('Name') === true) {
            contents.contents.push(getUniqueEquip(Unique)) ;
        }

        var equips = _chunkER(objData) ;

        equips.forEach(equip => {
            contents.contents.push(getEquipRequire({
                Name : name,
                Equips : equip
            })) ;
        }) ;

        context.sendFlex(`${name}的角色資訊`, contents) ;
    },

    showRecommend : function(context, name, objData) {
        context.sendFlex(`${name}的推薦Rank`, getRecommend(objData)) ;
    },
}