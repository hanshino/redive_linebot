const GachaModel = require('../../model/princess/gacha') ;
const random = require('math-random') ;
const GachaTemplate = require('../../templates/princess/gacha') ;
const memory = require('memory-cache') ;

function getTotalRate(gachaPool) {
    var result = gachaPool.map(data => parseFloat(data.rate.replace('%', ''))).reduce((pre, curr) => pre + curr) ;
    return [Math.round(result * 10000), 10000] ;
}

/**
 * 進行亂數產生
 * @param {Number} times
 * @returns {Array}
 */
function genRandom(max, min, times = 1) {
    let result = [] ;
    for (let i = 0 ; i < times ; i++) {
        result.push(Math.round(random() * (max - min) + min)) ;
    }

    return result ;
}

/**
 * 進行轉蛋
 * @param {Array} gachaPool 轉蛋池
 */
function play(gachaPool, times = 1) {
    const [max, rate] = getTotalRate(gachaPool) ;
    // 產出亂數陣列，用該數字，取得轉蛋池中相對應位置之獎勵
    const randomAry = genRandom(max, 1, times).sort((a, b) => a - b) ;

    var stack = 0 ; // 數字堆疊
    var anchor = 0 ; // 處理到的亂數陣列錨點
    var rewards = [] ; // 轉出獎勵陣列

    gachaPool.forEach(data => {
        if (anchor >= randomAry.length) return ;
        let top = Math.floor(parseFloat(data.rate.replace('%', '') * rate)) ;

        // 介於轉蛋池中的 堆疊數 和 頂點 的亂數 即為抽出內容物
        while(randomAry[anchor] >= stack && randomAry[anchor] <= stack + top && anchor < randomAry.length) {
            rewards.push({...data}) ;
            anchor++ ; // 處理下一錨點
        }

        stack += top ; // 數字往上堆疊
    }) ;

    return rewards ;
}

/**
 * 篩選出符合標籤之轉蛋池
 * @param {Array} gachaPool
 * @param {String} tag
 */
function filterPool(gachaPool, tag) {
    if (tag === undefined) return gachaPool.filter(data => data.isPrincess === '1') ;

    var isPrincess = true ;
    var resultPool = gachaPool.filter(data => {
        let tags = (data.tag || '').split(',') ;
        if (tags.indexOf(tag) !== -1) {
            isPrincess = (data.isPrincess === '0') ? false : true ;
            return true ;
        }
    }) ;

    // 非公主池子，直接回傳
    if (isPrincess === false) return resultPool ;

    // 無符合標籤，回傳滿池，不過將非公主角色排除
    if (resultPool.length === 0) return gachaPool.filter(data => data.isPrincess === '1') ;

    // 有篩選出特定標籤，將1,2星角色補滿池子
    return resultPool.concat(gachaPool.filter(data => (data.star < 3 && data.isPrincess === '1'))) ;
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

function isAble(groupId) {
    if (memory.get(`GachaCoolDown_${groupId}`) === null) {
        memory.put(`GachaCoolDown_${groupId}`, 1, 120 * 1000) ;
        return true ;
    }

    return false ;
}

module.exports = {
    play : async function(context, { match }) {
        try
        {
            var { tag, times } = match.groups ;

            if (context.platform === 'line'
            && context.event.source.type === 'group'
            && isAble(context.event.source.groupId) === false) return ;

            const gachaPool = await GachaModel.getData() ;
            var filtPool = filterPool(gachaPool, tag) ;

            times = ((times || '10').length >= 3) ? 10 : parseInt(times) ;
            times = 10 ; // 暫定恆為10
            var rewards = shuffle(play(filtPool, times)) ;

            var rareCount = {} ;

            rewards.forEach(reward => {
                rareCount[reward.star] = rareCount[reward.star] || 0 ;
                rareCount[reward.star]++ ;
            }) ;

            GachaTemplate.line.showGachaResult(context, {
                rewards : rewards,
                rareCount : rareCount,
                tag : tag,
            }) ;
        }
        catch(e)
        {
            console.log(e) ;
        }
    }
}