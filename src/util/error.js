module.exports = {
    sendError : function(context, errMsg) {
        switch(context.platform) {
            case 'line' : context.sendText(errMsg) ;break ;
            case 'telegram' : context.sendMessage(errMsg) ;break ;
            default : context.send(errMsg) ;
        }
    }
}