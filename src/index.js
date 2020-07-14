const fs = require('fs') ;
const path = require('path') ;
const App = require('./app') ;
const dbFolder = path.join(process.env.PROJECT_PATH, './database') ;

module.exports = App ;

const migration = require('./migration') ;

async function init() {

    if (fs.existsSync(dbFolder) === false) fs.mkdirSync(dbFolder) ;

    return await Promise.all(
        Object.keys(migration).map(key => migration[key]().then(res => console.log(`${key}資料庫初始化成功。`)).catch(err => console.error(err)))
    ) ;
}

init() ;