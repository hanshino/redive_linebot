const gachaTPL = {"type":"bubble","body":{"type":"box","layout":"vertical","spacing":"sm","contents":[]}} ;

/**
 * 產出轉蛋頭像框
 * @param {Array} rewards 
 */
function genGachaContent(rewards) {
    let bubbleMessage = JSON.parse(JSON.stringify(gachaTPL)) ;
    let box = {
        type : 'box',
        layout : 'horizontal',
        contents : [],
        spacing : 'sm',
    } ;

    let temp = [] ;

    rewards.forEach((reward, index, selfAry) => {
        temp.push({
            type : 'image',
            url : reward.image,
            size : 'xs'
        }) ;

        if (temp.length === 5 || index === selfAry.length - 1) {
            bubbleMessage.body.contents.push({
                ...box, contents : temp,
            }) ;
            temp = [] ;
        }
    }) ;

    return bubbleMessage ;
}

module.exports = {
    /**
     * 發送轉蛋結果訊息
     * @param {LineContext} context 
     * @param {Object} objData
     * @param {Object} objData.rewards
     * @param {Object} objData.rareCount
     * @param {Object} objData.tag
     */
    showGachaResult : function(context, {rewards, rareCount, tag = '無'}) {
        var bubbleMessage = genGachaContent(rewards) ;

        let reportBox = {
            type : 'box',
            layout : 'vertical',
            contents : [],
            spacing : 'md',
        } ;

        reportBox.contents.push({
            type : 'text',
            contents : [
                {type : 'span', text : '許願內容：'},
                {type : 'span', text : tag},
            ],
            weight : 'bold',
            align : 'center',
        }) ;

        let strReport = [] ;
        Object.keys(rareCount).sort((a, b) => b - a).forEach(key => {
            switch(key) {
                case '3':
                    strReport.push(`彩*${rareCount[key]}`) ;
                break ;
                case '2':
                    strReport.push(`金*${rareCount[key]}`) ;
                break ;
                case '1':
                    strReport.push(`銀*${rareCount[key]}`) ;
                break ;
            }
        }) ;

        reportBox.contents.push({
            type : 'text',
            text : strReport.join(' '),
            align : 'center',
        }) ;

        bubbleMessage.body.contents.push(reportBox) ;

        context.sendFlex('轉蛋結果', bubbleMessage) ;
    }
}