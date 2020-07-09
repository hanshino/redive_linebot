# 公主連結聊天機器人

本專案是基於框架[bottender](https://bottender.js.org/)進行實作，此框架特色

* 適用於多種臺灣常用聊天app ~~雖然我都沒有好友，只好寫機器人陪我聊天~~
* 框架已處理好不同平台的規則，無須因應各平台進行適應
* 開發過程協助分析每一動作的耗時，進行效能優化
* 因為他真的超好用der

## 事前準備

* [Node.js](https://nodejs.org/en/)
* Line機器人申請，記下 Access Token & Client Secret

## 安裝方式

1. 打開你的CLI跟著我一起輸入(終端機、命令提示字元、命令介面)
2. `git clone https://github.com/hanshino/redive_linebot.git`
3. `cd redive_linebot`
4. `cp .env.example .env`
5. `npm install` or `yarn install`
6. 等待安裝...
7. `npm start` or `yarn start`
8. 開始對話吧！

## 注意事項

* 進行安裝方式第四步之後，記得編輯裡面的內容，填上你機器人的相對應的資料哦～
* 如果沒有自己的 web server 的話，在第7步可以改輸入 `npm run dev` or `yarn dev` 會取得一串ngrok網址，將網址設定到相對應機器人的 webhook 即可！