const mysql = require("../src/util/mysql");

module.exports = main;

async function main() {
  let setX = mysql.raw("SET @x = 0;");
  let update = mysql("chat_user_data")
    .update({ rank: mysql.raw("@x:=@x+1") })
    .orderBy("experience", "desc");

  return mysql.transaction(async trx => {
    await setX.transacting(trx);
    await update.transacting(trx);
  });
}

if (require.main === module) {
  main().then(() => process.exit(0));
}
