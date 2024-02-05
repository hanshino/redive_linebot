const { generateRuleBubble } = require("../common");

const swordmanSetsumei = ["劍士類的第一個轉職，是以近戰為主的職業。", "將學會 震地斬擊"];
const mageSetsumei = ["法師類的第一個轉職，是以魔法攻擊為主的職業。", "將學會 元素之力"];
const thiefSetsumei = ["盜賊類的第一個轉職，是以暗殺為主的職業。", "將學會 致命一擊"];

exports.swordman = {
  type: "bubble",
  hero: {
    type: "image",
    url: "https://pcredivewiki.tw/static/images/unit_big/unit_big_104761.jpg",
    size: "full",
    aspectMode: "cover",
    aspectRatio: "16:9",
  },
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            contents: [
              {
                type: "span",
                text: "你就是這次要轉職的冒險者嗎？\n",
              },
              {
                type: "span",
                text: "好，劍士轉職考驗已經等待你多時。",
              },
              {
                type: "span",
                text: "在這場任務中，你只需在",
              },
              {
                type: "span",
                text: " 十次攻擊內 ",
                weight: "bold",
                color: "#541239",
              },
              {
                type: "span",
                text: "擊倒指定敵人。\n",
              },
              {
                type: "span",
                text: "成為劍士後，你的爆發力將得到進一步的提升。",
              },
              {
                type: "span",
                text: "現在，不要多話，展現給我看，看看你是否值得成為我們中的一員。准備好了嗎？",
              },
            ],
            wrap: true,
            size: "xs",
          },
        ],
      },
    ],
  },
  footer: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "轉職為劍士",
            align: "center",
            weight: "bold",
            size: "sm",
          },
        ],
        backgroundColor: "#FF512357",
        paddingAll: "lg",
        cornerRadius: "lg",
        action: {
          type: "postback",
          data: JSON.stringify({
            action: "startSwordmanChangeJobMission",
          }),
        },
      },
    ],
  },
};

exports.mage = {
  type: "bubble",
  hero: {
    type: "image",
    url: "https://pcredivewiki.tw/static/images/unit_big/unit_big_126531.jpg",
    size: "full",
    aspectMode: "cover",
    aspectRatio: "16:9",
  },
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            contents: [
              {
                type: "span",
                text: "你就是這次要轉職的冒險者嗎？\n",
              },
              {
                type: "span",
                text: "你將面臨一項嚴峻的轉職任務。",
              },
              {
                type: "span",
                text: "在這次的挑戰中，你需，",
              },
              {
                type: "span",
                text: " 依序詠唱指定的魔法 ",
                weight: "bold",
                color: "#541239",
              },
              {
                type: "span",
                text: "深化你對元素之力的理解。\n",
              },
              {
                type: "span",
                text: "這不僅是技術的考驗，更是展現你與魔法之間深刻連結的契機。",
              },
              {
                type: "span",
                text: "挑戰吧，讓法師之火在你的心靈中燃燒。",
              },
            ],
            wrap: true,
            size: "xs",
          },
        ],
      },
    ],
  },
  footer: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "開始挑戰",
            align: "center",
            weight: "bold",
            size: "sm",
          },
        ],
        backgroundColor: "#51FF2357",
        paddingAll: "lg",
        cornerRadius: "lg",
        action: {
          type: "postback",
          data: JSON.stringify({
            action: "startMageChangeJobMission",
          }),
        },
      },
    ],
  },
};

exports.thief = {
  type: "bubble",
  hero: {
    type: "image",
    url: "https://pcredivewiki.tw/static/images/unit_big/unit_big_104661.jpg",
    size: "full",
    aspectMode: "cover",
    aspectRatio: "16:9",
  },
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            contents: [
              {
                type: "span",
                text: "你就是這次要轉職的冒險者嗎？\n",
              },
              {
                type: "span",
                text: "在陰影中學會生存的本領，年輕的盜賊。\n",
              },
              {
                type: "span",
                text: "你的任務是找出我指定的物品\n這不僅需要你靈活的身手，更需要透過敏銳的觀察力找出",
              },
              {
                type: "span",
                text: "隱匿於暗影中的寶藏。\n",
                weight: "bold",
                color: "#541239",
              },
              {
                type: "span",
                text: "這項挑戰將讓你了解，致命爆擊的奧秘並非只存在於武器之中，更源自於環境的細微變化。\n",
              },
              {
                type: "span",
                text: "去吧，用你的觀察力引導致命一擊的誕生。",
              },
            ],
            wrap: true,
            size: "xs",
          },
        ],
      },
    ],
  },
  footer: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "開始挑戰",
            align: "center",
            weight: "bold",
            size: "sm",
          },
        ],
        backgroundColor: "#5123FF57",
        paddingAll: "lg",
        cornerRadius: "lg",
        action: {
          type: "postback",
          data: JSON.stringify({
            action: "startThiefChangeJobMission",
          }),
        },
      },
    ],
  },
};

exports.swordmanSetsumei = generateRuleBubble(swordmanSetsumei, "劍士");
exports.mageSetsumei = generateRuleBubble(mageSetsumei, "法師");
exports.thiefSetsumei = generateRuleBubble(thiefSetsumei, "盜賊");

exports.changeJob = {
  type: "carousel",
  contents: [
    exports.swordman,
    exports.swordmanSetsumei,
    exports.mage,
    exports.mageSetsumei,
    exports.thief,
    exports.thiefSetsumei,
  ],
};

exports.swordmanMission = {
  type: "bubble",
  hero: {
    type: "image",
    url: "https://i.imgur.com/vJTOEZx.png",
    size: "full",
    aspectMode: "cover",
    aspectRatio: "16:9",
  },
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "寒風熊魔",
            weight: "bold",
            size: "sm",
          },
          {
            type: "text",
            text: "目標：在10次攻擊內討伐 (限時10分鐘)",
            size: "xs",
          },
          {
            type: "text",
            text: "hp: ???? / ????",
            size: "sm",
          },
        ],
      },
    ],
  },
  footer: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "button",
        action: {
          type: "postback",
          label: "攻擊",
          data: JSON.stringify({
            action: "swordmanChangeJobMission",
          }),
        },
        style: "primary",
        color: "#FF546874",
      },
    ],
  },
};

exports.mageMission = {
  type: "bubble",
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "image",
        url: "https://i.imgur.com/madPUvn.png",
        size: "full",
      },
      {
        type: "image",
        url: "https://i.imgur.com/SibuJK6.png",
        size: "xs",
        position: "absolute",
        offsetStart: "45%",
        offsetTop: "13%",
        action: {
          type: "postback",
          label: "火",
          data: JSON.stringify({
            action: "mageChangeJobMission",
            element: "fire",
          }),
        },
      },
      {
        type: "image",
        url: "https://i.imgur.com/RIcPn9i.png",
        size: "xs",
        position: "absolute",
        offsetStart: "13%",
        offsetTop: "45%",
        action: {
          type: "postback",
          label: "水",
          data: JSON.stringify({
            action: "mageChangeJobMission",
            element: "water",
          }),
        },
      },
      {
        type: "image",
        url: "https://i.imgur.com/1VZHcCz.png",
        size: "xs",
        position: "absolute",
        offsetEnd: "13%",
        offsetTop: "45%",
        action: {
          type: "postback",
          label: "風",
          data: JSON.stringify({
            action: "mageChangeJobMission",
            element: "wind",
          }),
        },
      },
      {
        type: "image",
        url: "https://i.imgur.com/J0ks57i.png",
        size: "xs",
        position: "absolute",
        offsetBottom: "13%",
        offsetStart: "45%",
        action: {
          type: "postback",
          label: "土",
          data: JSON.stringify({
            action: "mageChangeJobMission",
            element: "earth",
          }),
        },
      },
    ],
  },
};

exports.thiefMission = {
  type: "bubble",
  body: {
    type: "box",
    layout: "vertical",
    contents: [
      {
        type: "image",
        url: "https://i.imgur.com/vuIUFEC.jpg",
        size: "full",
      },
      {
        type: "box",
        layout: "vertical",
        contents: [],
        cornerRadius: "md",
        position: "absolute",
        width: "60px",
        height: "30px",
        offsetTop: "58%",
        action: {
          type: "postback",
          data: JSON.stringify({
            action: "thiefChangeJobMission",
            id: 1,
          }),
        },
      },
      {
        type: "box",
        layout: "vertical",
        contents: [],
        cornerRadius: "md",
        position: "absolute",
        width: "45px",
        height: "30px",
        offsetTop: "45%",
        offsetStart: "45%",
        action: {
          type: "postback",
          data: JSON.stringify({
            action: "thiefChangeJobMission",
            id: 2,
          }),
        },
      },
      {
        type: "box",
        layout: "vertical",
        contents: [],
        cornerRadius: "md",
        position: "absolute",
        width: "60px",
        height: "20px",
        offsetTop: "60%",
        offsetEnd: "0%",
        action: {
          type: "postback",
          data: JSON.stringify({
            action: "thiefChangeJobMission",
            id: 3,
          }),
        },
      },
    ],
    paddingAll: "none",
  },
};
