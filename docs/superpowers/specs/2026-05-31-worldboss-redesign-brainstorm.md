# 世界王系統重構 — 腦力激盪進度（進行中）

> **狀態:腦力激盪進行中。** 2026-05-31 起，2026-06-06 接續推進。
> 本文是「恢復用」存檔：記錄已拍板的決策、決策理由、以及還沒討論的待辦。
> **進度**:核心叢集 §A 獎勵定位 / §B 發放 / §C 生命週期 已定（**D1–D12**）；戰鬥叢集 §F 戰鬥數值與三職機制 已定（**D13–D21**）。**下次從 §4.B-餘 獎勵數值階梯 接續**（§F + 每日頻率已備齊,可算 faucet 速率）。
> **分支**:`feat/worldboss-redesign`（2026-06-06 從 worktree 改為主目錄正常開發；遠端 `origin/feat/worldboss-redesign` 待 force-push 更新）。

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

### 裝備系統 & 道具經濟現況（2026-06-06 探勘，獎勵設計地基）
- **裝備（兩表）**：`equipment`（圖鑑：`id/name/slot[weapon|armor|accessory]/job_id/rarity[common→rare→epic→legendary]/attributes(JSON)/image_url`）+ `player_equipment`（玩家擁有：`user_id/equipment_id/slot/is_equipped`，**unique `(user_id, equipment_id)` → 每件只能擁有一件，重複給會 throw「已擁有此裝備」**）。屬性 JSON 欄位：`atk_percent / crit_rate / cost_reduction / exp_bonus / gold_bonus`。**無等級/星/強化機制（屬性建立後永久不變）**；只有 3 格、各裝一件。
- **取得管道**：唯一程式路徑 `EquipmentService.addToInventory(userId, equipmentId)`。**沒有合成/商店/掉落/材料系統**。裝備**不在** Inventory ledger，是獨立表。
- **戰鬥整合**：`EquipmentService.getEquipmentBonuses()` 在 `WorldBossController.attack` 時讀；`atk_percent` 乘傷害、`cost_reduction` 減成本、`exp_bonus` 加經驗。
- **道具經濟**：`Inventory` 是 **append ledger**（餘額 = `SUM(itemAmount)`，負值=扣）；女神石 `itemId=999`（`increaseGodStone/decreaseGodStone({userId, amount, note, trx})`）；角色 = GachaPool id；**目前無「材料」item 類別（需新增 item id）**。`(userId,itemId)` 索引已於 #727 補上。
- **冪等黃金範本** = Janken 每日獎勵：`JankenDailyRewardLog.tryInsert()` 撞 unique key `(user_id, reward_date)` 回 `false` 跳過 + 同一 `trx` 內發 ledger（`JankenRewardService.js:21-110`）。**世界王結算照抄此式**：建 reward-log 表 unique `(user_id, world_boss_event_id[, board])`。其他前例：Race（查 `payout` NOT NULL）、Achievement（unique `user_achievements`）、Coupon（查使用歷史）。

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

### D7. 獎勵幣別 = **成長迴圈（裝備向），不直接送聊天經驗**
- 主軸定位選「成長迴圈為主」：boss 主要吐**裝備相關**資源；女神石只當**少量點綴頂獎**；榮耀靠各榜 MVP 稱號（沿用現成成就/稱號軌道，近乎零成本）。
- **關鍵修正（使用者）**：**不直接送聊天經驗**——那是轉生那套系統（[[chat-level-prestige]]），兩套養成解耦。裝備可帶 `exp_bonus` **間接**加成聊天經驗，但那是裝備被動效果，不是「打贏王→領 X 經驗」的直接掛鉤。

### D8. 加**裝備強化層（可堆疊材料）** — 解掉裝備系統太淺的飽和死局
- 問題：現有裝備系統很淺（見 §2 探勘）——3 格、每件 unique-owned、無強化。**純掉「整件裝備」會快速飽和**（裝滿 3 格後掉落無用或被系統拒收），撐不起「打王→變強→打更兇」的成長迴圈。
- 解法：**boss 掉可堆疊「強化素材」**（新 item id，進 Inventory ledger）→ 花素材強化已有裝備。**可堆疊素材永不飽和**，且完美套用現有 ledger + Janken 冪等模式。

### D9. 強化層規格（v1）
- **決定性 +1**：花 N 個素材保證升一級，sink 在「成本曲線」而非失敗挫折（不做 RNG 掉級）。成本隨等級遞增。
- **單一通用素材**：v1 只有一種強化素材；架構保留未來分階（低/中/高階）空間。
- **上限 +10 × 每級 +5%**：有效屬性 = base ×(1 + enhance_level×5%)，滿強 = base ×1.5（數值可細調）。
- `player_equipment` 新增 `enhance_level`（int, default 0）。
- **三職共用同一素材**：DPS 強化 `atk_percent`；補師/坦克的 gear 屬性（治療力/格擋力）待 §F 戰鬥定案後補上。同素材通用 → 確保稀缺輔助職也有成長迴圈。

### D10. 經濟獎勵 = **只在結算發**（settlement-only）
- 每刀回饋 = **戰鬥本身**（傷害數字 / 三榜排名跳動 / 階段·狂暴公告），**不滴經濟**。
- 素材 + 女神石在**擊殺或逃跑結算**一次發 → 一次結算 = 一個乾淨的**冪等批次**（套 Janken `tryInsert`，每人每 event 一筆 unique key），天然防 ×N 漏發。
- 素材作為成長貨幣**保持稀缺**（每刀滴會狂吐通膨 + ledger 寫入量爆）。
- 成就系統不受影響（仍每刀 `evaluate`）。

### D11. 發放方式 = **自動入袋 + 下次互動戰報揭曉**（no claim）
- 結算直接把獎勵寫進 Inventory（冪等 ledger，就是那筆 reward-log）。
- 揭曉走 pull-based：(1) 玩家**下次互動**時 reply 前置「戰報卡」（看過清一次性未讀旗標），(2) LIFF 結算頁回顧。
- **不做 claim**：休閒玩家常忘領 → 參與獎流失 → 客訴；auto-credit 不會漏領、狀態也更單純。

### D12. 開王節奏 = **每日輪替王**（cron 自動開）
- cron 每天固定時間自動開**一隻全服共王**，HP 調到「全服當天合力打得死」；打死 → 結算 + 隔天開下一隻；到期沒打死 → 王逃跑、只發參與獎。
- **單一活動**（沿用現有 `getHoldingEventId` 單王限制）；管理員維護**王圖鑑/排程**但不必逐隻手動開（痛點 #2 解）。
- 與每日攻擊上限對齊（`daily_limit=100`、普攻成本 10 → 約每日 10 刀的「精力」按日結算）。

### §C 補充. 發現性（no-push 下，pull-based 全用上）
- **LIFF 世界王頁**（常駐當前王：血條/三榜/攻擊鈕）+ **`#世界王` 群組/個人指令**（查當前王/自己貢獻/三榜前段）+ **戰報卡兼新王公告**（下次互動時「揭曉昨日獎 + 宣告今日新王」合一，一次 pull-based 觸達）。
- 冷啟動限制（完全不互動者收不到）是 no-push 固有天花板，靠習慣 + LIFF + 指令覆蓋積極玩家，接受。

### D13. 王怎麼還手 = **平常被動,狂暴才反擊（綁在玩家出手那一刻）**
硬限制 D3「出手當下結算、無時鐘」→ 王不能用背景 tick 打人,反擊只能綁在「有人出手」那一刻。平常階段王是被動木樁(純 DPS 競速、沒人會倒);打過血量門檻進狂暴時,**那一刀的結算順手把「最近一批攻擊者」打進待救池**,狂暴期破防(對王傷害×2)+ 貢獻×2 + 王持續反擊,坦克擋、補師救。
- 對照否決案:每刀都可能反擊 → 沖淡狂暴高潮,且休閒玩家點一下就被打倒、no-push 下不知道也等不到救 → 大量卡死的倒地玩家、客訴。改成「只有狂暴期會倒」天然繞掉這個死結。

### D14. 戰鬥模型 = **兩階段（平靜 / 狂暴）**
- **平靜帶（HP 100%→35%,可調）**:王被動,攻擊只扣血,沒人會倒。純 DPS。坦/補這段無事可做(可接受)。
- **狂暴帶（35%→0%）**:由「打過 35% 那一刀」觸發。此後到死:對王傷害 ×2(破防)+ 貢獻 ×2。兩個擊倒來源,皆 tick-free:
  1. **進場批次**:觸發那一刀把「最近一段時間內最後 N 個攻擊者」整批打進待救池（signature「狂暴!一批人倒下」,對齊 D2）。
  2. **持續反擊**:狂暴期內每次攻擊有機率被王反擊擊倒（綁在攻擊者自己出手當下）。

### D15. DPS（`#攻擊`）
沿用現有職業傷害風格(劍士/法師/盜賊),但戰鬥邏輯先看 `role` 再看職業(D5)。狂暴期傷害×2、貢獻×2。風險:狂暴期會被擊倒。進 **傷害榜**。

### D16. 坦克（`#格擋`）
開「格擋窗口」（Redis TTL,tick-free）:窗口內的下一次擊倒事件被吸收/減免 —— 進場批次來時吃掉 X 個名額,讓那些 DPS 不進池。貢獻 = 吸收掉的擊倒數,進 **格擋榜**。坦克是「全服的牆」,不需指定對象。

### D17. 補師（`#復活` + `#護盾`）
- `#復活`:撈待救池裡「最久沒被救」的 K 人(K 小,可調)拉回戰場。
- `#護盾`:給「最近還沒有護盾的 K 個攻擊者」一個免疫 token,擋下一次擊倒。
- D4 原列「補血/護盾」,在無血條模型(D-下方 A 案)下只剩護盾這半;補血移除。兩個動作都進 **治療榜**(狂暴期同樣×2,救人在狂暴中才是高價值)。補師是唯一能在進場前「預備」(平靜末段先鋪盾)的職。

### D-血量. 玩家**無血條,擊倒是二元狀態**（A 案）
玩家沒有 HP 數字。狂暴觸發 → 那批人直接被擊倒進池(除非被坦克擋掉名額、或被補師事前護盾保住)。
- 砍掉整條「玩家血量 / 每刀反擊傷害 / 殘血判定」子系統,資料只剩一個 `knocked_down` 狀態 + 護盾 token。
- 在 D13/D14 框架下平常階段根本不掉血,血條 90% 時間滿的、毫無意義;唯一會掉的時刻用「二元擊倒 + 護盾 token」就完整表達。
- 代價:沒有殘血掙扎的細膩;補師動詞只有兩個(護盾、復活)。

### D18. 待救池規則
被擊倒 → 進池(記 `knocked_at` timestamp)。`#復活` 撈最久的。**自然恢復**:倒地超過 T 分鐘(可調,約 30 分)自動站起,且為**懶評估** —— 玩家下次互動(或結算)時才檢查 `knocked_at + T < now`,不用 cron。保證 no-push 下沒人永遠卡在倒地(解掉 §E 隱憂)。

### D19. 輔助動作一律「**無目標、系統自動選**」
復活撈最久的、護盾鋪最近沒盾的、格擋吸收下一波 —— 全部不需玩家指定對象。LINE 沒有好用的多選/點名 primitive,無目標設計是這個平台的正解。

### D20. 新增 gear 屬性（接 D9 強化層）
現有屬性只服務 DPS(`atk_percent` 等)。補兩個:`support_power`(補師:每次復活/護盾的 K 人數)、`block_power`(坦克:格擋窗口吸收的名額)。D9 通用素材照樣強化「你 role 對應的屬性」,三職成長迴圈補齊。

### D21. v1 起始數值（全可調）
階段門檻 35%;進場批次 = 最近 10 分鐘內最後 ~20 個攻擊者;狂暴反擊機率 ~15%;破防/貢獻 ×2;自然恢復 30 分;復活/護盾每次 K=1~3;格擋窗口 ~5 分;每日精力沿用現有(上限 100、普攻成本 10),補/坦動作也各自吃精力 → 每天約 10 個動作分配在攻擊/救/擋之間。

> **§F 整包精神**:平靜期極簡(純打)、所有複雜度與三職同台全收進狂暴窗口;每個機制都綁在「玩家出手」或「Redis TTL」上、零 cron、零背景 tick。

---

## 4. 待討論（下次從這裡接續）

> **§A/§B/§C 已轉為 D7–D12;§F 戰鬥數值與三職機制已轉為 D13–D21（見 §3）。** 下次從 **§B-餘 獎勵數值階梯** 接續(§F 戰鬥規模 + §C 每日頻率都備齊了,可算 faucet 速率),再往下 §D 即時體驗 / §E 指令 UX / §G 資料模型。

### F. 戰鬥數值與三職機制細節 ✅ 已定 → D13–D21（見 §3）

### B-餘. 獎勵數值階梯〔下次起點〕
- 參與獎 vs 三榜名次獎 vs MVP 的素材/女神石階梯數字（= faucet 速率,§F 戰鬥規模 + §C 每日頻率已備齊,可開算）。

### D. 即時體驗（LIFF + Socket.IO）
- 玩家端世界王 LIFF 頁：即時血條、三榜即時跳動、攻擊/治療/格擋按鈕（呼叫 REST）。
- 新 Socket.IO namespace + `io.emit`（目前只有後台聊天用）。聊天維持 reply-only。
- 這是繞過 push 限制做出「即時感」的正解，也給玩家開著 LIFF 盯戰場的理由。

### E. 指令 / 動作 UX
- 三職指令動詞（`#攻擊` / `#治療` / `#復活` / `#格擋` …）。
- 被擊倒狀態的回饋（下次出手才知道自己倒了 → reply 提示「你已倒下，等補師復活或自然恢復」）。
- 與現有群組 5 分鐘批次節流如何並存。
- **戰報 piggyback 的積極度**（每次互動前置 vs 只在相關指令/LIFF；牽涉群組批次節流）。

### G. 資料模型重構
- event 加 `status/killed_at/結算` 欄位；log 加 `role`/動作種類；待救池表；**獎勵發放冪等表**（unique `(user_id, world_boss_event_id[, board])`，套 `JankenDailyRewardLog` 式）；`player_equipment` 加 `enhance_level`；**新增「強化素材」item id**（進 Inventory ledger）；補齊索引 `(world_boss_event_id)/(user_id)/(created_at)`。
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

下次新對話：載入專案記憶後會看到 `project_worldboss_redesign` 指向本文。**核心經濟/生命週期(D7–D12)+ 戰鬥叢集(D13–D21)已定,直接從 §4.B-餘 獎勵數值階梯 接續**一次一題的腦力激盪即可。本文 §2 系統地圖 + 裝備/道具探勘可省去重新摸 code 的功夫。分支 `feat/worldboss-redesign`（主目錄正常開發）。
