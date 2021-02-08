const { default: axios } = require("axios");
const { getClient } = require("bottender");
const line = getClient("line");

exports.setAllowPicture = context => {
  setAllowPicture(context, true);
  context.sendText("請上傳戰隊傷害報告圖片");
};

exports.isAllow = context => {
  let { userDatas } = context.state;
  let { userId } = context.event.source;
  let userData = userDatas[userId];

  if (!userId) return false;
  if (!userData) return false;

  return context.event.isImage && userData.isAllowGuildReport;
};

exports.analyze = async context => {
  let messageId = context.event.image.id;
  await line
    .getMessageContent(messageId)
    .then(buffer => {
      let imageBase = buffer.toString("base64");
      return axios.post("http://192.168.1.104:5000/api/v1/Guild/Battle/Info", {
        image: imageBase,
        type: "image",
      });
    })
    .then(res => res.data)
    .then(data => {
      context.sendText(data.map(d => d.unit_name).join("\n"));
    })
    .catch(err => console.error(err));

  setAllowPicture(context, false);
};

function setAllowPicture(context, isAllow = true) {
  let { userDatas } = context.state;
  let { userId } = context.event.source;

  let userData = userDatas[userId];
  context.setState({
    userDatas: {
      ...userDatas,
      [userId]: { ...userData, isAllowGuildReport: isAllow },
    },
  });
}
