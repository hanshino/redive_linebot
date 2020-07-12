const sqlite = require('../../util/sqlite') ;
const path = require('path') ;
const sql = require('sql-query-generator') ;
var db = null ;
async function openDB() {
    if (db !== null) return ;
    return sqlite.open(path.join(process.env.PROJECT_PATH, process.env.PRINCESS_SQLITE_PATH)).then(database => db = database) ;
}

exports.table = 'CustomerOrder' ;
exports.columnsAlias = [
    { o: 'NO', a: 'no' },
    { o: 'SOURCE_ID', a: 'sourceId' },
    { o: 'ORDER_KEY', a: 'orderKey' },
    { o: 'CUSORDER', a: 'cusOrder' },
    { o: 'TOUCH_TYPE', a: 'touchType' },
    { o: 'MESSAGE_TYPE', a: 'messageType' },
    { o: 'REPLY', a: 'reply' },
    { o: 'CREATE_DTM', a: 'createDTM' },
    { o: 'CREATE_USER', a: 'createUser' },
    { o: 'MODIFY_DTM', a: 'modifyDTM' },
    { o: 'MODIFY_USER', a: 'modifyUser' },
] ;

/**
 * 對資料庫新增指令
 * @param {Object} objData
 * @param {Number} objData.NO
 * @param {String} objData.SOURCE_ID
 * @param {String} objData.ORDER_KEY
 * @param {String} objData.CUSORDER
 * @param {String} objData.TOUCH_TYPE
 * @param {String} objData.MESSAGE_TYPE
 * @param {String} objData.REPLY
 * @param {String} objData.CREATE_DTM
 * @param {String} objData.CREATE_USER
 * @param {String} objData.MODIFY_USER
 */
exports.insertOrder = async function (objData) {
    await openDB() ;

    var query = sql.insert(this.table, objData) ;

    return sqlite.run(query.text, query.values) ;
}

exports.queryOrderBySourceId = async function (sourceId) {
    await openDB() ;

    var query = sql.select(this.table, getColumnName(this.columnsAlias)).where({SOURCE_ID : sourceId, STATUS : 1}) ;

    return sqlite.all(
        query.text,
        query.values,
    ) ;
}

exports.queryOrderByKey = async function (orderKey, sourceId) {
    await openDB() ;

    var query = sql.select(this.table, getColumnName(this.columnsAlias)).where({ORDER_KEY : orderKey, SOURCE_ID : sourceId, STATUS : 1}) ;

    var result = await sqlite.get(
        query.text,
        query.values,
    ) ;

    return result ;
}

/**
 * 取得可刪除指令列表
 * @param {String} cusOrder 
 */
exports.queryOrderToDelete = async (cusOrder, sourceId) => {
    await openDB() ;

    var query = sql.select(this.table, getColumnName(this.columnsAlias)).where({
        SOURCE_ID : sourceId,
        CUSORDER : cusOrder,
        STATUS : 1
    }) ;

    return sqlite.all(query.text, query.values) ;
}

/**
 * 將指令進行狀態切換
 * @param {Object} objData
 * @param {String} objData.orderKey
 * @param {String} objData.sourceId
 * @param {String} objData.modifyUser
 * @param {Number} status 0:關閉,1:啟用
 * @returns {Promise}
 */
exports.setStatus = (objData, status) => {
    var query = sql.update('CustomerOrder', {
        status : status,
        modify_user : objData.modifyUser,
        modify_DTM : new Date().getTime(),
    }).where({
        source_id : objData.sourceId,
        order_key : objData.orderKey,
        status : 1
    }) ;

    return sqlite.run(
        query.text,
        query.values,
    ) ;
}

/**
 * 觸發指令紀錄
 * @param {String} order 
 * @param {String} sourceId 
 */
exports.touchOrder = (order, sourceId) => {
    var query = sql.update('CustomerOrder', {
        touch_dtm : new Date().getTime(),
    }).where({
        source_id : sourceId,
        cusOrder : order,
        status : 1,
    }) ;

    return sqlite.run(
        query.text,
        query.values,
    ) ;
}

function getColumnName(columnsAlias) {
    return columnsAlias.map(col => `${col.o} as ${col.a}`).join(',') ;
}