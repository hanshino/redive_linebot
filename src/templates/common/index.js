/**
 * 存放通用函式庫
 */
module.exports = {
    assemble : function(mapData, strData){

        var objMapData = {} ;

        Object.keys(mapData).forEach(key => {
            let newIndex = '{' + key.toLowerCase() + '}' ;
            objMapData[newIndex] = mapData[key] ;
        }) ;

        var re = new RegExp(Object.keys(objMapData).join('|'), 'gi') ;

        var strResult = strData.replace(re, function(matched){
            matched = matched.toLowerCase() ;
            return objMapData[matched] ;
        }) ;

        return strResult ;
    }
}