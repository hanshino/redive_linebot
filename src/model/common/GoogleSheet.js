const fetch = require('node-fetch') ;
const SheetUrl = 'https://docs.google.com/spreadsheets/u/0/d/{key}/gviz/tq?' ;

module.exports = {
    /**
     * 使用SQL語法取得表單資料
     * @param {Object} objData 必備參數：gid,type,query,key
     */
    querySheetData : function(objData)
    {
        var params = {
            gid : objData.gid,
            tqx : 'out:' + objData.type,
            tq : encodeURIComponent(objData.query)
        } ;

        var queryString = Object.keys(params).map((key) => {
            return key + '=' + params[key]
        }).join('&') ;

        var url = SheetUrl.replace('{key}', objData.key) + queryString ;

        return queryData(url) ;
    }
}

function queryData(url)
{
    return fetch(url)
    .then(res => res.text())
    .then(resp => {
        let jsonResult = resp.match(/\{.*\}/)[0] ;

        try
        {
            return queryParse(JSON.parse(jsonResult)) ;
        }
        catch(e)
        {
            console.log(e) ;
            console.log(jsonResult) ;
            console.log('Google表單回傳物件無法解析') ;
            return false ;
        }
    }) ;
}

function queryParse(data)
{
    var rows = data.table.rows ;

    var title = data.table.cols.map(col => {
        return (col.label !== '') ? col.label.trim() : col.id ;
    }) ;

    var result = [] ;

    rows.forEach(function(row){
        let temp = {} ;
        row.c.forEach(function(value, index){
            if (value === null) return ;
            temp[title[index]] = (value.hasOwnProperty('f')) ? value.f : value.v ;
        }) ;
        result.push(temp) ;
    })

    return result ;
}