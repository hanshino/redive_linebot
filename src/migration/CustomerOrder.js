const sqlite = require('../util/sqlite') ;
const path = require('path') ;

module.exports = async () => {

    await sqlite.open(path.join(process.env.PROJECT_PATH, process.env.PRINCESS_SQLITE_PATH)) ;

    var createStatment = 'CREATE TABLE IF NOT EXISTS "CustomerOrder" (' ;
    createStatment    += '"ID"              INTEGER PRIMARY KEY AUTOINCREMENT,'
    createStatment    += '"NO"              INTEGER NOT NULL,'
    createStatment    += '"SOURCE_ID"       TEXT NOT NULL,'
    createStatment    += '"ORDER_KEY"       TEXT NOT NULL,'
    createStatment    += '"CUSORDER"        TEXT NOT NULL,'
    createStatment    += '"STATUS"          INTEGER DEFAULT 1,'
    createStatment    += '"TOUCH_TYPE"      TEXT NOT NULL,'
    createStatment    += '"MESSAGE_TYPE"    TEXT NOT NULL,'
    createStatment    += '"REPLY"           TEXT NOT NULL,'
    createStatment    += '"CREATE_DTM"      TEXT NOT NULL,'
    createStatment    += '"CREATE_USER"     TEXT NOT NULL,'
    createStatment    += '"MODIFY_DTM"      TEXT,'
    createStatment    += '"MODIFY_USER"     TEXT NOT NULL,'
    createStatment    += '"SENDER_NAME"     TEXT,'
    createStatment    += '"SENDER_ICON"     TEXT,'
    createStatment    += '"TOUCH_DTM"       TEXT'
    createStatment    += ');'

    return sqlite.run(createStatment) ;
}