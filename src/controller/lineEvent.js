const { router, route, line } = require('bottender/router') ;
const CustomerOrderModel = require('../model/application/CustomerOrder') ;
const welcome = require('../templates/common/welcome') ;
const lineAPI = require('../util/line') ;

module.exports = (context, props) => {

    return router([
        line.follow(HandleFollow),
        line.unfollow(HandleUnfollow),
        line.join(HandleJoin),
        line.leave(HandleLeave),
        line.memberJoined(HandleMemberJoined),
        line.memberLeft(HandleMemberLeft),
        route('*', props.next),
    ]) ;

}

function HandleMemberJoined(context) {
    // nothing to do
}

function HandleMemberLeft(context) {
    // nothing to do
}

function HandleFollow(context) {
    context.sendText(`感謝加我好友，先為您提供以下功能`) ;
    welcome(context) ;
}

async function HandleJoin(context) {

    if (context.event.source.type === 'room') {
        welcome(context) ;
        return ;
    }

    context.sendText('感謝邀請我至群組，群組初始化開始...') ;

    const [summary, countData] = await Promise.all([
        lineAPI.getGroupSummary(context.event.source.groupId),
        lineAPI.getGroupCount(context.event.source.groupId),
    ]) ;

    context.sendText(`已設置好群組資訊：\n群組名稱：${summary.groupName}\n群組人數：${countData.count}`) ;

    context.sendText('如需觀看使用說明，請輸入：#使用說明') ;
}

function HandleUnfollow(context) {
    // 進行自訂指令刪除
    CustomerOrderModel.orderShutdown(context.event.source.userId) ;
}

function HandleLeave(context) {
    // 進行自訂指令刪除
    CustomerOrderModel.orderShutdown(context.event.source.groupId || context.event.source.roomId) ;
}