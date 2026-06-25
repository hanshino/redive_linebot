# 聊天用字分布與文字雲系統

**Date:** 2026-06-22
**Status:** Concept（聚焦：個人聊天文字雲）
**Scope:** 把群組對話轉成個人／群組的用字分布，主打文字雲體驗；股市等下游應用列為長期藍圖

---

## 背景

專案已有聊天經驗、成就、賽馬、猜拳、世界王、交易與背包等系統，多以玩家主動下指令為核心。

這個系統要補的是另一種體驗：讓玩家看見「自己平常都在聊什麼」。把每個人的群組發言聚合成用字分布、做成文字雲——高頻的字大、低頻的小，一眼看出自己的口頭禪、課金怨念、推的角色。這是會被截圖分享的東西。

更遠的虛擬股市、群組日報那些，放到基礎建設做滿之後再說。第一版只要能穩定回答「我平常都在聊什麼」就有價值。

---

## 核心理念

```txt
LINE 文字訊息
→ 非同步進話題分析 queue
→ jieba 斷詞 / stopwords 過濾 / 別名正規化
→ 依 (group, user, date, keyword) 聚合字頻
→ 個人文字雲 (LIFF) + 群組文字雲 + LINE 文字榜
```

重點是「萃取用字分布」，不是「保存聊天紀錄」。

---

## 設計原則

### 1. 先做個人體驗，不先做股市

個人文字雲是主線。股市、飆升訊號、日報、成就都是下游，等這層資料穩定可信再做。

### 2. 存聚合字頻，不存原文；個人雲本人可見

長期保存的是字頻聚合，不是句子。`凱留×40`、`笑死×22` 這種數字回推不出你說過的句子，所以「不留原文」仍然成立。

- 個人文字雲：只有本人看得到自己的。
- 群組文字雲：只顯示聚合結果，不掛任何個人名字。

保留：`group_id, user_id, stat_date, keyword, message_count`
不保留：完整訊息原文、逐字聊天歷史。

### 3. 斷詞是核心，別名正規化收斂題材

要呈現真實用字就需要中文斷詞（jieba 類）。在斷詞之上再做一層別名正規化，把社群黑話收斂成正規題材：

```txt
黑貓、臭鼬 → 凱留
可蘿、媽媽 → 可可蘿
世王 → 世界王
蘭德索爾盃 → 賽馬
```

自訂詞典（user dict）有兩個工作，POC 在 13MB 真實匯出上都驗證過：

- **保持完整**：多字題材（蘭德索爾盃、可可蘿）與台味俚語（笑死、課金、好可愛）會被通用斷詞切成單字而消失（POC 實測 `笑死→笑/死`、`課金→課/金`、`蘭德索爾盃→單字`）。把這些表面形式餵進 user dict，斷詞時才會保留整顆。
- **正規化**：命中別名的 token 收斂成 canonical（黑貓/臭鼬 → 凱留）。

個人雲看到真實用字，未來題材／股市層也免費拿到乾淨資料。**雲的品質直接隨字典涵蓋度成長**——這也是後台字典維護重要的原因（見未來藍圖）。

### 4. 雜訊過濾與防洗

- **token 必須含至少一個漢字**：一次濾掉拉丁字母、數字、URL、emoji、標點、以及花式 Unicode 字母（POC 真實資料中有人用 `𝕃𝕠𝕝𝕚` 這類數學粗體字洗版，純 ASCII 過濾擋不掉，因為它們是多碼位字元）。
- **stopwords 用標準 zh-TW 清單**（哈工大／marimo 等，約 1–2k 詞），不要手刻——手刻清單在 POC 一眼就被「不要/可以/知道/就是」這種填充詞灌爆。
- 長度 1 的 token 一律丟（少數有意義的單字一起犧牲，要救再加白名單）。
- 指令訊息不計入（沿用既有 `COMMAND_PREFIX_RE`）。
- 防洗：同一則訊息裡同一個 keyword 只計一次——貼 100 次同一句只 +1。

---

## MVP 範圍

### 功能

```txt
1. 群組文字訊息非同步進分析 queue（指令、太短的先濾掉）
2. jieba 斷詞 → stopwords/長度過濾 → 別名正規化 → 同則去重
3. 依 (group, user, date, keyword) 聚合字頻到 topic_daily
4. LIFF 個人文字雲（預設近 30 天，可切 7 天）
5. LINE 指令回個人 top-N 文字榜
6. 群組文字雲（同表聚合，幾乎免費）
7. 過期資料清理 cron
```

### 非目標

```txt
股市、價格推導、交易
飆升 / 相對熱度訊號
未知詞 → 字典後台
高成本 AI 分類
原文長期保存
私聊分析
```

---

## 資料模型

### `topic_daily`（核心，唯一新表）

細粒度日聚合，所有視圖用 `GROUP BY` 推導。

```txt
id
group_id
user_id
stat_date
keyword
message_count
created_at
updated_at
UNIQUE (group_id, user_id, stat_date, keyword)
```

- 個人雲：`WHERE user_id=? AND stat_date in 範圍 GROUP BY keyword`
- 群組雲／熱門：`WHERE group_id=? ... GROUP BY keyword`，人數 `COUNT(DISTINCT user_id)`

去重人數從表的粒度免費掉出來，不需要額外 dedup 表或 Redis 狀態。模式對齊既有 `ChatExpDaily`。

### `topic_keyword`（字典；承載 user dict 的兩種條目）

```txt
id
canonical_key
display_name
aliases          -- 別名表面形式，正規化用
kind             -- normalize（收斂成 canonical）| keep（俚語，保持完整、不收斂）
category
enabled
weight
created_at
updated_at
```

別名 + canonical + `kind=keep` 的詞全部餵進 jieba 自訂詞典；`kind=normalize` 的另外建「表面形式 → canonical」對照。可先空著起步，靠後台逐步長大（見未來藍圖）。

---

## 系統流程

### Ingest

現有 `EventDequeue` 已在 worker 批次 `rPop("ChatBotEvent")`，原文 text 現成。在 `handleChatExp` 旁掛 sibling，把最小必要資料推進 `TOPIC_ANALYSIS_RECORD`（指令前綴、太短的在這裡先濾）：

```json
{ "userId": "U...", "groupId": "C...", "text": "今天凱留又爆死了", "ts": 1782090000000 }
```

### 分析 cron（複製 `ChatExpUpdate.js`）

pop 批次 → 每則 `jieba → 過濾 → 正規化 → 同則去重` → 記憶體累積 `(group, user, date, keyword)` → upsert `topic_daily`。登記進 `crontab.config.js`，配自己的 kill-switch（學 `CHAT_XP_PAUSED`）。

**為何獨立 cron、不 inline 進 EventDequeue**：EventDequeue 那條路同時存 reply token、drain broadcast，是回覆能否送出的命脈；jieba 是 CPU 工作，不該有機會拖累 reply token 落地。隔一條 queue + 獨立 kill-switch 的隔離值得。

### 清理

複製 `ChatExpEventsPrune.js`，按 `stat_date` 清舊資料（用字雲是開放詞彙、cardinality 大，要定期 prune）。

---

## 對外體驗

LIFF 是主要 rich view（真正的文字雲）；LINE 指令回的 Flex 是聊天室內的 fallback——目標是「快速、好讀、一鍵進完整雲」，不是在 Flex 裡硬做雲。

### LINE 指令

```txt
/我的文字雲   → 個人排行條 Flex（見下）
/群組話題     → 群組聚合排行條 Flex
```

### Flex 呈現：排行條（已選定）

LINE 沒辦法不生圖就排版成雲，所以 in-chat 用**排行榜**而非假雲：每列＝名次 + 詞 + 比例長條 + 真實次數。每台裝置渲染一致、不跑版、數字精準；真正的雲在 LIFF（footer 按鈕一鍵進）。比較過字級雲（span，最像雲但會跑版、長詞會被切）與氣泡格（膠囊牆，但 box 不換行、伺服器估字寬估錯就 silent clip）後選排行條——驗證分數最高、最少新程式碼。

實作（對齊 repo 既有寫法，已對 LINE Flex schema 驗證）：

```txt
- 純 JSON：exports.generateWordCloudFlex({rows, period, liffUri})
  → context.replyFlex(altText, bubble)
- 長條沿用既有元件：Achievement.js / Race.js 的
  「灰底 track box + 內層 fill box（width: "<pct>%"）」
- 每列 = baseline box[名次(flex:0) + 詞(flex:1) + 次數(flex:0)] + 6px track/fill 長條
- 顏色從 common/theme.js（FEATURE/SURFACE）；
  LIFF 用 getLiffUri(..., "/topics") 不要寫死（route 維持小寫 kebab）
- 長條寬度：FLOOR≈8% + GAMMA≈0.7 拉伸，避免長尾被壓成看不見；
  真實 count 照印當 source of truth
- giga bubble；N 每顆上限 ~12（驗證 12 列≈8.5KB，14 列就破 10KB/bubble）
  → 想要 7天/30天 或 >12 名：2-顆 carousel（≤10 顆、≤50KB）
- 用 rows.map() 產列；不要用已棄用的 filler，空 contents:[] 的 fill box 在 repo 已實戰可用
```

### LIFF 頁面 `/topics`

```txt
個人文字雲（wordcloud2.js / d3-cloud；React 已在）
期間切換 7 天 / 30 天
群組文字雲
```

未來可加分類篩選、趨勢、飆升。

---

## POC（動依賴與建表前先驗證）

B 路線的賭注是「jieba + stopwords + 別名，能不能把群組中文變成好看的雲」。這個假設值得在建表 / 接 LIFF 前用最少程式碼驗證。

**專案目前沒有可撈的長期聊天文字**——`ChatBotEvent` 是會被即時 drain 的 queue，`MessageRecord` 只有計數沒有原文，`ConversationLog` 是 capped 的 Redis AI session buffer，這都是刻意的隱私設計。所以 POC 的料來源：

```txt
1. 機制驗證：用合成的 PCR 風格樣本，獨立 script 跑
   jieba → 過濾 → 正規化 → 印頻率表。
   證明套件裝得起來、別名收斂正確、自訂詞典阻止切碎。
2. 品質驗證：手動匯出一段真實群組對話貼進去，
   判斷雲好不好看、stopwords / 詞典要不要補。
```

零 infra、零 migration、零 queue。POC harness 在 `poc/topic-wordcloud/`（`wordcloud-poc.js` 跑合成樣本、`line-cloud.js` 吃真實 LINE 匯出）。

### POC 結果（已驗證）

在一份 13MB / 349k 行的真實群組匯出上跑過：

- **效能**：全部跑完 < 1 秒，throughput 完全不是問題（不影響「獨立 cron」的決定——那是為了故障隔離，不是速度）。
- **解析**：`HH:MM 名字 訊息`（空白分隔、CRLF），正確排除 bot（布丁）、15k 指令、101k 媒體佔位（圖片/貼圖…）。
- **機制全過**：prebuilt binary 安裝免編譯、別名正規化正確（世王→世界王）、user dict 阻止多字詞被切碎、同則去重有效。
- **兩個只有真實資料才踩得到的雜訊**，各一行修掉：花式 Unicode 字母（`𝕃𝕠𝕝𝕚`）→「token 必含漢字」過濾；填充詞灌爆 → 換標準 stopword 清單。修完後個人雲已能讀出一個人的口吻。

結論：B 路線成立，`@node-rs/jieba` 採用。雲的品質由兩個靜態資產（stopword 清單 + 策展字典）驅動，沒有任何難搞的東西。

---

## 未來藍圖（基礎建設做滿後再議）

### 飆升詞與字典維護迴圈

「正在上升的詞」分兩種，難度天差地別。

**Case 1 — 字典裡已有的詞在上升（幾乎免費）**

`topic_daily` 已是 `(group, date, keyword)` 日聚合，飆升只是近期 vs 基準線：

```txt
近期量（最近 1–3 天） vs baseline（前 14/30 天日均）
surge = 近期 / baseline，或 z-score = (近期 − 平均) / 標準差
雙閘門檻：絕對量要夠（擋 1→3 = +200% 假飆）＋ 相對倍數
看「不同人數」在升 (COUNT DISTINCT user_id) 比看訊息數可靠
```

不必新表、不必預算，查詢時 `GROUP BY` 即可（資料量 < 1s）。要推播才需存歷史。可比股市早很多就上。

**Case 2 — 全新的詞冒出來（難，也是重點）**

硬限制：`topic_daily.keyword` 只會有「通過 pipeline 的詞」= jieba 認得的 + 字典裡的。全新俚語（如未收錄前的「笑死」）會被切成單字丟掉、**根本不進 `topic_daily`**，所以永遠不會出現在飆升榜。

→ 後台新增字典不是錦上添花，是抓新詞上升的**前置條件**：新詞要先能被看見、被收錄，pipeline 才追得到它上升。

需要一條跟主雲分開的**發現層**：

```txt
1. 候選抽取：漢字 n-gram 頻率（2–4 字子字串 × 不同使用者數，
   再用左右鄰字熵 / PMI 濾子字串雜訊）。
   不能靠 jieba HMM 新詞模式 —— POC 證明救得了「課金」、救不了「笑死」。
2. 候選池 topic_unknown_candidate(group_id, term, message_count,
   user_count, first_seen, last_seen, status)
3. 後台 triage：按「近期頻率 × 不同人數」排序，上升中的自然浮上來。
   動作：收錄為新 keyword / 合併到既有 alias / 忽略 (status=ignored)
4. 收錄後寫進 topic_keyword → 下次 pipeline 載進 user dict
   → 從此進 topic_daily → Case 1 的飆升偵測就追得到它了。
```

**內建延遲**：新詞被收錄前沒有 `topic_daily` 歷史，第一波「上升」只能靠發現層候選訊號當早期預警，收錄後才進正式飆升榜——抓的是第二波。reply-only 環境可接受。

### 建議順序（不必一次做完）

```txt
1. 後台字典 CRUD 先做（甚至比飆升早）
   —— 直接改善 MVP 雲品質（品質隨字典涵蓋度走），又是後面一切的基礎。
   v1 發現新詞可先靠人工：管理員看到新梗手動加，不必一開始上 n-gram。
2. 已知詞飆升榜：純 topic_daily 查詢，Phase 2/3 隨時加。
3. 自動新詞發現（n-gram）→ 候選池：Phase 3，最重，最後做。
```

### 其他下游

- **虛擬股市**：吃飆升訊號（相對熱度 / 活躍人數 / 分散度 / 異常）當價格訊號，而非直接等於聲量。
- **群組日報**：每日最熱角色 / 飆升題材 / 趨勢。
- **成就**：首次帶起飆升、題材連續上榜、用字多樣性達標。

---

## 開放問題

1. 個人雲期間預設 30 天可接受？要不要 all-time？
2. 群組文字雲預設開還是 opt-in？（傾向預設開、管理員可關、不掛人名）
3. ~~斷詞套件~~ → 已定 `@node-rs/jieba`（POC 實測 prebuilt 免編譯、< 1s 跑完 349k 行）。
4. lurker 發言太少時，雲要不要設最低門檻才顯示？

---

## 結論

先把這個系統當「個人／群組用字分布」來做，文字雲是第一個、也最能自我說明的體驗。等這層字頻資料穩定，再自然延伸到飆升訊號、虛擬股市、群組日報與成就。先驗證最關鍵的假設：群組聊天能不能變成好看、好玩、可重複使用的個人化資料。
