exports.showUploadInfo = (context, info) => {
  let isSuccess = { 1: "勝利", 0: "失敗" };
  let messages = [];
  messages.push(
    `左方：${info.left.team.map(char => char.name).join(" ")} *${isSuccess[info.left.result]}*`
  );
  messages.push(
    `右方：${info.right.team.map(char => char.name).join(" ")} *${isSuccess[info.right.result]}*`
  );

  context.sendText(messages.join("\n"));
};
/**
 * 詢問是否繼續操作
 * @param {Context} context
 */
exports.askContinue = context => {
  context.sendFlex("操作面板", {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "image",
          url:
            "https://cdn.discordapp.com/attachments/798811827772981268/811631089813684264/106400601.png",
          size: "full",
          offsetTop: "0px",
          aspectMode: "cover",
          aspectRatio: "4:3",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "🎉🎉恭喜你完成了一次操作🎉🎉",
              color: "#FFFFFF",
              align: "center",
            },
            {
              type: "text",
              text: "您可以選擇繼續上傳同類型的圖片\n或者點擊按鈕進行其他操作",
              wrap: true,
              color: "#FFFFFF",
              align: "center",
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    {
                      type: "box",
                      layout: "vertical",
                      contents: [
                        {
                          type: "text",
                          text: "解陣查詢",
                          align: "center",
                          color: "#FFFFFF",
                        },
                      ],
                      backgroundColor: "#50ABC3",
                      cornerRadius: "md",
                      paddingAll: "5px",
                      action: {
                        type: "message",
                        text: "#競技場查詢",
                      },
                    },
                    {
                      type: "box",
                      layout: "vertical",
                      contents: [
                        {
                          type: "text",
                          text: "上傳戰報",
                          align: "center",
                          color: "#FFFFFF",
                        },
                      ],
                      cornerRadius: "md",
                      backgroundColor: "#50ABC3",
                      paddingAll: "5px",
                      action: {
                        type: "message",
                        text: "#競技場上傳",
                      },
                    },
                  ],
                  spacing: "sm",
                },
                {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "text",
                      text: "結束操作",
                      align: "center",
                      color: "#FFFFFF",
                    },
                  ],
                  backgroundColor: "#50ABC3",
                  cornerRadius: "md",
                  paddingAll: "5px",
                  action: {
                    type: "message",
                    text: "#競技場結束操作",
                  },
                },
              ],
              spacing: "sm",
              paddingAll: "5px",
            },
          ],
          position: "absolute",
          backgroundColor: "#808080AB",
          paddingAll: "10px",
          offsetBottom: "0px",
          spacing: "sm",
          offsetEnd: "0px",
          offsetStart: "0px",
        },
      ],
      paddingAll: "0px",
    },
  });
};

exports.showSearchNoneData = (context, searchTeam) => {
  context.sendFlex("查無結果", genSearchCover(searchTeam));
  context.sendText("很抱歉，查無此陣容的解法！");
};

/**
 * 發送查詢結果
 * @param {Context} context
 * @param {Array<String>} searchTeam
 * @param {Array<{like: Number, unlike: Number, images: Array}>} resultTeams
 */
exports.showSearchResult = (context, searchTeam, resultTeams) => {
  let teamBlocks = resultTeams.map(team => {
    console.log(team);
    return {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: team.images.map(image => ({ type: "image", url: image })),
          spacing: "sm",
        },
        {
          type: "box",
          layout: "horizontal",
          contents: [
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  align: "center",
                  color: "#808080",
                  contents: [
                    {
                      type: "span",
                      text: "👎",
                    },
                    {
                      type: "span",
                      text: " ",
                    },
                    {
                      type: "span",
                      text: `${team.unlike}`,
                    },
                  ],
                },
              ],
              backgroundColor: "#FF000080",
              cornerRadius: "xl",
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "text",
                  align: "center",
                  color: "#808080",
                  contents: [
                    {
                      type: "span",
                      text: "👍",
                    },
                    {
                      type: "span",
                      text: " ",
                    },
                    {
                      type: "span",
                      text: `${team.like}`,
                    },
                  ],
                },
              ],
              backgroundColor: "#00FF0080",
              cornerRadius: "xl",
            },
          ],
          spacing: "sm",
        },
      ],
      spacing: "sm",
      paddingAll: "3px",
    };
  });

  let chunkBlocks = _chunk(teamBlocks, 3);

  let bubbles = chunkBlocks.map(chunk => {
    return {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: chunk,
      },
    };
  });

  let flexMessage = {
    type: "carousel",
    contents: [genSearchCover(searchTeam), ...bubbles],
  };

  context.sendFlex("競技場查詢結果", flexMessage);
};

/**
 * 產生搜尋結果的封面
 * @param {Array} searchTeam
 */
function genSearchCover(searchTeam) {
  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "image",
          url:
            "https://cdn.discordapp.com/attachments/798811827772981268/811630964974682142/106400401.png",
          gravity: "top",
          aspectMode: "cover",
          size: "full",
        },
        {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "敵方防守隊伍 辨識結果",
            },
            {
              type: "box",
              layout: "horizontal",
              contents: searchTeam.map(image => ({ type: "image", url: image })),
              spacing: "sm",
            },
            {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "box",
                  layout: "horizontal",
                  contents: [
                    {
                      type: "box",
                      layout: "vertical",
                      contents: [
                        {
                          type: "text",
                          text: "解陣查詢",
                          align: "center",
                          color: "#FFFFFF",
                        },
                      ],
                      backgroundColor: "#50ABC3",
                      cornerRadius: "md",
                      paddingAll: "5px",
                      action: {
                        type: "message",
                        text: "#競技場查詢",
                      },
                    },
                    {
                      type: "box",
                      layout: "vertical",
                      contents: [
                        {
                          type: "text",
                          text: "上傳戰報",
                          align: "center",
                          color: "#FFFFFF",
                        },
                      ],
                      cornerRadius: "md",
                      backgroundColor: "#50ABC3",
                      paddingAll: "5px",
                      action: {
                        type: "message",
                        text: "#競技場上傳",
                      },
                    },
                  ],
                  spacing: "sm",
                },
                {
                  type: "box",
                  layout: "vertical",
                  contents: [
                    {
                      type: "text",
                      text: "結束操作",
                      align: "center",
                      color: "#FFFFFF",
                    },
                  ],
                  backgroundColor: "#50ABC3",
                  cornerRadius: "md",
                  paddingAll: "5px",
                  action: {
                    type: "message",
                    text: "#競技場結束操作",
                  },
                },
              ],
              spacing: "sm",
              paddingAll: "5px",
            },
          ],
          position: "absolute",
          offsetBottom: "0px",
          offsetStart: "0px",
          offsetEnd: "0px",
          backgroundColor: "#87F9C5CC",
          paddingAll: "10px",
          paddingStart: "15px",
          spacing: "sm",
        },
      ],
      paddingAll: "0px",
    },
  };
}

function _chunk(procArray, step = 3) {
  let results = [];
  let start = 0;

  while (start < procArray.length) {
    results.push(procArray.slice(start, start + step));
    start += step;
  }

  return results;
}
