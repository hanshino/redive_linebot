# 公主連結聊天機器人

本專案是基於框架[bottender](https://bottender.js.org/)進行實作，此框架特色

* 適用於多種臺灣常用聊天app ~~雖然我都沒有好友，只好寫機器人陪我聊天~~
* 框架已處理好不同平台的規則，無須因應各平台進行適應
* 開發過程協助分析每一動作的耗時，進行效能優化
* 因為他真的超好用der

## 目前適用聊天軟體

* [Line](https://line.me/zh-hant/)
* [Telegram](https://telegram.org/)

## 事前準備

* [Git](https://git-scm.com/)
* [Node.js](https://nodejs.org/en/)
* Line機器人申請，記下 Access Token & Client Secret

## 安裝方式

1. 打開你的CLI跟著我一起輸入(終端機、命令提示字元、命令介面)
2. `git clone https://github.com/hanshino/redive_linebot.git`
3. `cd redive_linebot`
4. `cp .env.example .env`
5. `npm install` or `yarn install`
6. 等待安裝...
7. `npm run dev` or `yarn dev`
8. 開始對話吧！

## 安裝方式 - console版本

* 照**安裝方式**的1~6動作，第七步改為 `npm run dev --console` or `yarn dev --console`

## 注意事項

* 進行安裝方式第四步之後，記得編輯裡面的內容，填上你機器人的相對應的資料哦～
* 如果有自己的 web server 的話，在第7步可以改輸入 `npm start` or `yarn start`

## 指令列表

    #抽
    #角色、#公主、#角色資訊、#角色技能、#角色行動、#角色專武、#角色rank
    #新增指令、#新增關鍵字指令