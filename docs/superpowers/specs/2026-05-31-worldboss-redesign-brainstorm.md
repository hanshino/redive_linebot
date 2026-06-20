# 世界王系統重構 — 腦力激盪進度（暫停存檔）

> **狀態:腦力激盪進行中、尚未完成。** 2026-05-31 暫停，過陣子接續。
> 本文是「恢復用」存檔：記錄已拍板的決策、決策理由、以及還沒討論的待辦。
> 下次接續時，從 §4「待討論」第一項（A. 獎勵定位哲學）開始即可。

---

## 1. 為什麼要重構（痛點）

使用者提出的四個痛點，已從程式碼層面逐一確認屬實：

1. **木樁王** — 王完全不會動：沒有攻擊、沒有階段、沒有狂暴、沒有 RNG。`world_boss` 表雖有 `attack/defense/speed/luck` 欄位但**戰鬥邏輯完全沒讀**（死欄位）。傷害公式只看攻擊者：`floor(level² + level×10)`，固定值。
2. **等管理員手動開** — 沒有任何指令、也沒有 cron 會生王/開王/關王；唯一開王方式是管理員從 LIFF 後台打 `POST /api/admin/world-boss-events`。
3. **獎勵幾乎沒自動化** — 王血歸零或時間到時，程式碼**什麼都不做**（只 log `boss is dead ... skip` 就 return）。沒有結算、MVP、掉落、發獎。唯一自動發的只有「聊天經驗值」（每刀按傷害佔比給）。排行榜純展示、不給東西。整個功能對女神石是**淨流出**（只有花 10000 石「夢幻回歸」刪掉爛刀）。
4. **遊戲性淺** — 玩家迴圈：`#攻擊` → 跳固定數字 → 重複到每日上限 100。唯一決策是「普攻 vs 技能一」與「要不要洗掉爛刀」。

---

## 2. 現況系統地圖（重構基礎，免得下次重摸）

### 端到端流程
- **開王**：僅管理員、僅 REST（LIFF `Admin/WorldbossEvent.jsx` → `POST /api/admin/world-boss-events` → `handler/WorldBossEvent/admin.js`，gate：`verifyToken + verifyAdmin + verifyPrivilege(5)`）。「開王」是隱含的：`start_time < now < end_time` 就是進行中。**不支援並行活動**（`getHoldingEventId()` 在 0 或 >1 個活動時回 `null`）。
- **攻擊**：`/^[.#/](攻擊|attack)$/` 或 Flex postback（`{action:"worldBossAttack", worldBossEventId, attackType:"<jobKey>|<skill>"}`）→ `WorldBossController.attack()` → `attackOnBoss()`。節流：1 秒 Redis NX 鎖 + 5 秒冷卻 + 每日成本上限 `daily_limit=100`（普攻成本 10）。
- **傷害**：`makeCharacter(jobKey,{level}).getStandardDamage()`，`level` 用**聊天等級（minigame level）**。裝備加成只調玩家側（`atk_percent`/`cost_reduction`/`exp_bonus`）。**完全決定性**（變異版 `getNormalDamage()` 存在但沒用）。
- **貢獻 = `SUM(damage)`**。剩餘血量不存，動態算 `world_boss.hp − SUM(damage)`。
- **結束**：`end_time` 過了查詢就查不到；`remainHp <= 0` 時 `attackOnBoss` 只 log 後 return，**零副作用**。無擊殺公告、無 MVP、無掉落、無結算。
- **獎勵**：唯一自動獎勵是聊天經驗（`boss.exp × 傷害佔比`，再過 `decidePenalty` 等級差懲罰 + 裝備 `exp_bonus`）。無金幣/道具/女神石。稱號由**另一支** cron `bin/TitleDelivery.js`（03:10）按**全服聊天等級**發，與打王無關。

### 副機制
- **夢幻回歸 `#夢幻回歸`**：花 `money_revoke_attack_cost=10000` 女神石刪掉自己最低傷害那筆 log，每日一次、需達每日成本上限後；20 秒咒語 80% 機率免費。**功能內唯一女神石流向，且純流出。**
- **群組防洗版批次**：群組內攻擊回覆進 Redis list，每 ~5 分鐘 flush 一次（`handleKeepingMessage`）；1:1 即時回。→ **群組內無即時回饋。**
- **自訂攻擊訊息**：玩家自訂攻擊台詞模板（`{display_name}/{boss_name}/{damage}` + tags），每刀抽樣。

### 資料模型（4 表 + 1 join 表，**全程無 FK / 無索引 / 無 unique，只有 PK**）
- `world_boss`（王定義/可重用模板）：`id,name,description,image,level,hp,attack,defense,speed,luck,exp,gold,...`。**只有 `level/hp/exp`(+名稱/圖) 實際使用**；`attack/defense/speed/luck` 是死欄位；`gold` 只顯示不發。
- `world_boss_event`（時間盒實例）：`id,world_boss_id,announcement,start_time,end_time,...`。**無 status / result / killed_at / 結算欄位。**
- `world_boss_event_log`（append-only 攻擊帳本，唯一真實來源）：`id,world_boss_event_id,user_id(內部數字 id 非 platform_id),action_type(自由 VARCHAR 存 "job|skill"),damage,cost(2024 加),created_at`。所有彙總（HP/排行/每日成本/出席/最高傷）都在查詢時 `GROUP BY` 算，**無支援索引**。
- `world_boss_user_attack_message` + `attack_message_has_tags`（自訂訊息+標籤；後者 `attack_message_id` 是 `INT UNSIGNED` 但父表 `id` 是 signed，故加不了真 FK）。
- 2021 的 `world_boss_tips`/`world_boss_notify` 已於 2026-03-27 drop，**勿對其設計**。

### 整合點
- **成就**：每刀一次 `AchievementEngine.evaluate(userId,"boss_attack",{level,damage,feature:"world_boss"})` + `notifyUnlocks()`。4 個 `boss_*` 成就（`boss_first_kill +50 / boss_level_10 +200 / boss_level_50 +500 / boss_top_damage +300`）。
- **經濟**：女神石走 Inventory ledger，`GODDESS_STONE_ITEM_ID=999`。功能本身淨流出。
- **EventCenter/每日任務**：世界王**沒接** `EventCenterService`，打王不進每日任務。
- **排行**：`getTopRank` = `SUM(damage) GROUP BY user`，純展示、不給東西、無快取、無 tie-break。
- **即時/Socket.IO**：世界王**完全沒用**。全 app 只有後台聊天 `/admin/messages` 用 socket。
- **前端 LIFF**：僅管理員 CRUD（世界王設定/活動/訊息），**無玩家頁、無即時血條、無排行頁、無網頁攻擊**。（注意 `Panel/BattleSign.jsx` 是公會戰，不是世界王。）
- **Cron**：`crontab.config.js` 16 個 job **沒有任何世界王 job**。對照 Race 有 `RaceAdvance.js`（每分鐘 create/advance/settle）— **自動生命週期的範本本專案已有。**

### 既有 bug（重構時順手清）
- `#worldrank` 呼叫不存在的 `getTopTen()` → 直接 throw（`WorldBossController.js:315`）。
- `boss_top_damage`「一刀入魂」**永遠解不開**：strategy 需 `ctx.isTopDamage`，但 evaluate 從沒算/傳（`AchievementEngine.js:179`）。
- 夢幻回歸 `revokeAttack` sort 了 import 的 module **function** `todayLogs` 而非取得的 logs（`:161`）→ 可能空操作但照樣扣錢。
- `WorldBoss` model 拼錯 `destory`（`:62`），admin 刪除依賴它。
- `/worldrank /allevent /bosslist` 回原始 `JSON.stringify` dump（debug 指令？）。
- `WorldBossUserAttackMessage.all()` 用 INNER join tags → 零標籤訊息隱形、N 標籤訊息回 N 筆重複。

---

## 3. 已拍板決策（含理由）

> 順序就是討論順序，每一項都是上一項的上游。

### D1. 體驗主軸 = **混合制：共同目標 + 個人榮耀**
全員一起把王打死，擊殺後所有參與者依貢獻分級發獎；同時各角色貢獻即時競爭排行榜搶額外獎勵。王會還手、玩家會被擊倒、補師存在感強。

### D2. 戰場範圍 = **全服共王**（單一全服 boss，非每群組）
保留「全服一起拚、跨群組比拚」的大場面。
- **含義**：在全服規模下「復活我朋友」沒意義，補師改成**全服支援經濟** — 狂暴把一批攻擊者擊倒進「全服待救池」，補師發動復活時撈起池子裡的人（例如最久沒被救的），救一個賺一份貢獻。比小圈圈更有「公共戰場」史詩感。

### D3. 戰鬥節奏 = **純血量門檻分階段 + 出手當下結算**（拿掉 cron 時鐘戰鬥事件）
- 王狀態完全由**剩餘血量%**決定。血只在被打時下降，所以階段轉換永遠發生在「有人正在打」的當下，能在那次 reply 公告（如「王進入狂暴！」）。**沒有任何可以用「等」躲掉的窗口**（要過狂暴只能打過去）。
- **狂暴期 = 破防（受傷翻倍）+ 貢獻翻倍的搶榜高潮**；坦克開格擋窗口擋、補師救場來化解。把「危險時段」轉成「三職同台的協調高潮」。
- 時間壓力放在**活動窗口** `start→end`：沒在期限內打死 → 王「逃跑」，全服只拿參與獎、拿不到擊殺大獎。不需推播。
- **cron 只負責自動開王 / 到時結算。**
- ⚠️ 使用者原本想要「時鐘狂暴」但擔心大家會避開那時間攻擊 → 我們用「血量門檻（躲不掉）+ 狂暴變高報酬搶榜窗口 + 坦補化解」三招破解了「集體迴避危險窗口」的經典陷阱，最後決定**乾脆拿掉時鐘那層**。

### D4. 角色定位 = **鐵三角：輸出 / 補師 / 坦克**
- **DPS**：用現有職業（劍士/法師/盜賊）的輸出風格。
- **補師**：復活倒下的人（撈待救池）+ 補血/護盾（減少被擊倒）。
- **坦克**：開「格擋窗口」全服護體、吸收狂暴反擊，讓 DPS 敢衝。
- 三職都能爬榜。狂暴期三職同台是高潮。

### D5. 角色取得架構 = **v1 永久天職、但架構向前相容到可切換**
使用者直覺：「想選『永久職業（選2）』，但覺得之後會擴充成『可切換（選1）』，未來可能用比較難的方式做轉換。」落成：
- **把「角色」做成獨立的一等欄位**（如 `world_boss_role`），**不要塞進現有職業 enum**；戰鬥邏輯一律看 `role`，不直接看職業。
- **v1：角色是天職、選一次定終身（或要付代價才換）** → 給養成/身分認同感。
- **現有職業（劍士/法師/盜賊）只在 DPS role 當「傷害風格」**；補師/坦克有自己的技能組，不綁舊職業。
- **未來「較難的轉換機制」**（高階二轉/昂貴儀式/限定道具換一場）= 把永久鬆綁成可切換。因戰鬥早就看 `role`，這是**加功能不是重寫**。
- **務必守住的原則:輔助是「加成」不是「硬門檻」** — 純 DPS 也打得死王（只是慢、險），補/坦讓它更順。否則全服永久職業配比一歪（沒人當補）就卡死。補/坦稀缺時，每次救援/格擋的貢獻價值自然飆高 → 用獎勵把人慢慢吸去當輔助（自我平衡的市場，只是反應較慢）。

### D6. 貢獻/排行 = **分職業榜，各自發獎**（不做跨職換算）
- 三張獨立榜：**傷害榜 / 治療榜 / 格擋榜**，各排各的、各給各的獎，每榜各自 MVP。
- 避開了「換算係數怎麼調、怎麼防刷」整包平衡地獄。
- 使用者原始願望（補血也算貢獻、能競爭、能拿獎）**依然成立** — 補師在治療榜競爭拿獎，只是不跟 DPS 數字硬擠同一行。
- **獎勵結構** = 參與/擊殺獎（共同，人人有份）+ 各榜名次獎（個人榮耀）。代價：沒有單一「全場 MVP」，但一職一個 MVP，反而更多人有舞台。

---

## 4. 待討論（下次從這裡接續，由上而下）

> **A 是被中斷的那一題，請從這裡開始。**

### A. 獎勵定位哲學（痛點 #3 正面對決）
世界王在遊戲經濟裡扮演什麼？候選：
1. **成長迴圈為主（裝備/材料/經驗）** — 打王→變強→打更兇的王。裝備現已加世界王傷害（`atk_percent`），迴圈是現成的。低通膨、最黏。女神石只當少量點綴。〔當時我的推薦〕
2. **女神石水龍頭** — 大方發女神石。誘因最強但衝擊經濟、會通膨（memory 標了石頭帳本 ×N 漏發風險）。需嚴格冪等與產出上限。
3. **榮耀為主（稱號/排名/紀念）** — 多給面子獎、實質資源少。零通膨但長期誘因可能不足。

### B. 獎勵細項 + 自動發放 + 冪等
- 具體發什麼（依 A 的定位）；參與獎 vs 名次獎的數值階梯。
- **自動結算**：擊殺（`remainHp<=0`）或活動到期時觸發；建議標記 event 為「已結算」狀態，async/cron 算完寫入。
- **冪等**：必須防重複發（參考 memory「Stone Ledger Refactor / reward ×N leak」）— 需要發放紀錄表 + unique 約束。
- **no-push 下怎麼領/得知**：auto-credit 進背包 vs 「待領取」claim（下次互動 reply 提示「世界王已討伐，戰利品已送達/點此領取」、或 LIFF 領取頁）。claim 有揭曉感且天然 pull-based。

### C. 生命週期 & 自動化 & 發現性（痛點 #2）
- cron 自動開王/輪替/結算（參考 `RaceAdvance.js`）；管理員是否仍能手動開/排程/調整。
- **no-push 下玩家怎麼知道王開了**：LIFF 即時頁 + 下次互動 reply 提示 + 群組查詢指令。
- event 是否要支援並行 / 自動接續下一隻王。

### D. 即時體驗（LIFF + Socket.IO）
- 玩家端世界王 LIFF 頁：即時血條、三榜即時跳動、攻擊/治療/格擋按鈕（呼叫 REST）。
- 新 Socket.IO namespace + `io.emit`（目前只有後台聊天用）。聊天維持 reply-only。
- 這是繞過 push 限制做出「即時感」的正解，也給玩家開著 LIFF 盯戰場的理由。

### E. 指令 / 動作 UX
- 三職指令動詞（`#攻擊` / `#治療` / `#復活` / `#格擋` …）。
- 被擊倒狀態的回饋（下次出手才知道自己倒了 → reply 提示「你已倒下，等補師復活或自然恢復」）。
- 與現有群組 5 分鐘批次節流如何並存。

### F. 戰鬥數值細節
- 玩家血量 / 被擊倒判定 / 反擊機率 / 階段門檻 / 狂暴倍率。
- 待救池機制（撈最久沒被救的？復活上限？）。
- 復活與護盾的數值；每日上限與成本（現 `daily_limit=100`、cost）。

### G. 資料模型重構
- event 加 `status/killed_at/結算` 欄位；log 加 `role`/動作種類；待救池；獎勵發放冪等表；補齊索引 `(world_boss_event_id)/(user_id)/(created_at)`。
- 死欄位 `attack/defense/speed/luck` 淘汰或重新賦予意義（boss 還手數值？）。

### H. 既有 bug 清理（見 §2 清單）

### I. 遷移
- 現有玩家全是 DPS（永久職業已鎖 `classAdv`）；新增補/坦角色要不要給一次免費重選。
- 既有 `world_boss_event_log` 歷史資料相容。

### J. 既有機制去留
- 「夢幻回歸」「自訂攻擊訊息」在新系統的去留 / 改造。

---

## 5. 硬限制（設計時不可違反）

- **不能用 LINE Push API（只能 reply）。** 所有「開王/擊殺/獲得獎勵」公告都得 pull-based：piggyback 在玩家下次互動的 reply，或走 LIFF。
- **Bottender middleware chain**：新指令掛 `OrderBased` 或 controller `.router`；postback 走 `HandlePostback`。群組訊息量被刻意節流（5 分鐘批次）。
- **cron worker 獨立**（`yarn worker` → `tasks.js`，`crontab.config.js`，`bin/`）；`RaceAdvance.js` 是自動生命週期的可抄範本。但 cron 結算後**不能主動通知群組**，結果只能下次 reply 或 LIFF 浮現。
- **Redis 可用**（鎖/冷卻/批次/快取，session 60m、state 15m）。
- **Socket.IO 可用**（共用 HTTP server，目前僅後台聊天）。
- **前端是 LIFF**（React 19 + MUI 7 + Vite，`@line/liff`，路由 kebab-case 命名見 `.omc/skills/frontend-route-path-convention-expertise.md`）。
- **金錢經濟走 Inventory ledger**，`GODDESS_STONE_ITEM_ID=999`，發放需冪等（避免 reward ×N leak）。
- **傷害用聊天等級（minigame level）** → 世界王與聊天等級/轉生（chat-level-prestige）系統相連，重構時注意交互。

---

## 6. 接續方式

下次新對話：載入專案記憶後會看到 `project_worldboss_redesign` 指向本文。直接從 **§4.A 獎勵定位哲學** 繼續一次一題的腦力激盪即可。本文 §2 系統地圖可省去重新摸 code 的功夫。
