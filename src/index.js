const fs = require('fs') ;
const path = require('path') ;
const App = require('./app') ;
const dbFolder = path.join(process.env.PROJECT_PATH, './database') ;

module.exports = App ;

const CustomerOrderMigration = require('./migration/CustomerOrder') ;

async function init() {

    if (fs.existsSync(dbFolder) === false) fs.mkdirSync(dbFolder) ;

    return await Promise.all([
        CustomerOrderMigration().then(res => console.log('客製化指令資料庫，初始化成功')).catch(err => console.error(err)),
    ])
}

init() ;