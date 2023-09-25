exports.showInsertManual = context => {
  context.quoteReply(
    "使用方式：.新增指令 指令 回覆\n特殊回覆關鍵字：{princess} {user} {1,100} [1,2,3]"
  );
};

exports.showDeleteManual = context => {
  context.quoteReply("使用方式：.移除指令 指令 指令金鑰");
};

exports.showDeleteOption = (context, deleteOrders) => {
  var uniqKeys = deleteOrders
    .map(data => data.orderKey)
    .filter((key, index, selfAry) => selfAry.indexOf(key) === index);

  context.quoteReply(`請問要刪除哪一筆？\n${uniqKeys.join("\n")}`);
};
