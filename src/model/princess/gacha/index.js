const GoogleSheet = require('../../common/GoogleSheet') ;

function getGachaPool() {
    return GoogleSheet.querySheetData({
        gid : '1573433732',
        type : 'json',
        key : '1VPWT_rM8iu_n-JEYVgmjAbPvolMlDVscgTUYlvgcLLI',
        query : 'SELECT * LABEL A "name", B "image", C "star", D "rate", E "isPrincess", F "tag"'
    }) ;
}

module.exports = {
    getData : getGachaPool,
}