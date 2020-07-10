const sqlite = require('../../util/sqlite') ;
const path = require('path') ;
var db = null ;
async function openDB() {
    if (db !== null) return ;
    return sqlite.open(path.join(process.env.PROJECT_PATH, process.env.PRINCESS_SQLITE_PATH)).then(database => db = database) ;
}

/**
 * 對資料庫新增指令
 * @param {Object} objData
 * @param {Number} objData.no
 * @param {String} objData.sourceId
 * @param {String} objData.orderKey
 * @param {String} objData.order
 * @param {String} objData.touchType
 * @param {String} objData.messageType
 * @param {String} objData.reply
 * @param {String} objData.createDTM
 * @param {String} objData.createUser
 * @param {String} objData.modifyUser
 */
async function insertOrder(objData) {
    await openDB() ;

    var objParam = genBindingParam(objData) ;

    var result = await sqlite.run(
        'INSERT INTO CustomerOrder (' +
        'NO, SOURCE_ID, ORDER_KEY, "ORDER", TOUCH_TYPE, MESSAGE_TYPE, REPLY, CREATE_DTM, CREATE_USER, MODIFY_USER)' + 
        ' VALUES (' +
        ':no, :sourceId, :orderKey, :order, :touchType, :messageType, :reply, :createDTM, :createUser, :modifyUser)'
    , objParam) ;

    return result ;
}

exports.queryOrder = async function (sourceId) {
    await openDB() ;

    return sqlite.all(
        'SELECT * FROM CustomerOrder WHERE SOURCE_ID = :sourceId',
        { ':sourceId' : sourceId },
    ) ;
}

exports.queryOrderByKey = async function (orderKey, sourceId) {
    await openDB() ;

    var result = await sqlite.get(
        'SELECT * FROM CustomerOrder WHERE ORDER_KEY = :orderKey AND SOURCE_ID = :sourceId',
        { ':orderKey' : orderKey, ':sourceId' : sourceId }
    ) ;

    return result ;
}

function genBindingParam(objData) {
    let objParam = {} ;
    Object.keys(objData).forEach(key => objParam[`:${key}`] = objData[key]) ; ;

    return objParam ;
}

exports.insertOrder = insertOrder ;