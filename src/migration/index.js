[
    'Guild',
    'GuildMembers',
    'CustomerOrder',
    'User',
].forEach(file => {
    exports[file] = require(`./${file}`) ;
}) ;