# 文檔索引 - Gacha & Inventory System

本目錄包含轉蛋與背包系統的完整設計文檔。

---

## 📚 文檔列表

### 1. 主要規格文檔

#### [GACHA_INVENTORY_FINAL_SPEC.md](./GACHA_INVENTORY_FINAL_SPEC.md)

**完整系統規格** - 必讀文檔

包含內容:

- ✅ 系統架構設計 (三層架構)
- ✅ 完整 Prisma Schema (所有表結構)
- ✅ 每日限制機制 (Dry Run)
- ✅ 天井系統設計
- ✅ 抽卡核心邏輯
- ✅ 遷移計畫
- ✅ API 設計建議
- ⚠️ 待確認事項清單 (第 5 章)

**何時閱讀**: 需要了解完整系統設計時

---

### 2. 決策輔助文檔

#### [RECOMMENDED_CONFIG.md](./RECOMMENDED_CONFIG.md)

**快速決策建議** - 忙碌者首選

包含內容:

- 🎯 業界標準推薦配置 (Ready to Use)
- 📊 參數對照表 (成本、機率、轉換率)
- 🎮 玩家體驗預覽
- ✅ 三種使用方式 (直接採用/部分調整/全部自訂)

**何時閱讀**: 需要快速決策時，或對業界標準不熟悉時

---

#### [DECISION_CHECKLIST.md](./DECISION_CHECKLIST.md)

**決策確認清單** - 完整自訂版

包含內容:

- 📋 8 個待確認項目 (分優先級)
- 📝 每個選項的影響分析
- 💡 推薦建議與參考數據
- ✅ 填寫範本 (可直接標記)

**何時閱讀**: 需要逐項自訂配置，或團隊需要正式確認時

---

## 🚀 使用流程建議

### 情境 1: 快速開始 (推薦)

```
1. 閱讀 RECOMMENDED_CONFIG.md
2. 確認是否同意推薦配置
3. 如同意 → 通知開發者「同意使用推薦配置」
4. 開始實作
```

**適用於**: 信任業界標準，希望快速推進

---

### 情境 2: 審慎決策

```
1. 先閱讀 GACHA_INVENTORY_FINAL_SPEC.md 了解完整架構
2. 閱讀 RECOMMENDED_CONFIG.md 了解建議值
3. 填寫 DECISION_CHECKLIST.md 進行確認
4. 提交確認清單給開發者
5. 開始實作
```

**適用於**: 需要團隊共識，或對某些參數有特殊要求

---

### 情境 3: 技術探討

```
1. 閱讀 GACHA_INVENTORY_FINAL_SPEC.md 完整規格
2. 重點關注:
   - 第 2 章: 架構設計 (為何這樣設計)
   - 第 3 章: Schema (資料庫結構)
   - 第 4 章: 核心邏輯 (演算法)
   - 第 6 章: 遷移計畫 (風險控制)
3. 提出技術問題或改進建議
```

**適用於**: 技術審查，或對設計有疑慮時

---

## 📊 文檔關係圖

```
GACHA_INVENTORY_FINAL_SPEC.md (完整規格)
    │
    ├──> 第 5 章: 待確認事項
    │       │
    │       ├──> RECOMMENDED_CONFIG.md (快速建議)
    │       │         │
    │       │         └──> "同意" → 開始實作
    │       │
    │       └──> DECISION_CHECKLIST.md (詳細確認)
    │                 │
    │                 └──> 填寫完成 → 更新規格 → 開始實作
    │
    └──> 第 3/4/6 章: Schema & 實作細節
            │
            └──> 開發者參考 (撰寫程式碼時)
```

---

## ✅ 當前狀態

| 文檔                          | 狀態    | 版本 | 最後更新   |
| ----------------------------- | ------- | ---- | ---------- |
| GACHA_INVENTORY_FINAL_SPEC.md | ✅ 完成 | 1.0  | 2026-01-25 |
| RECOMMENDED_CONFIG.md         | ✅ 完成 | 1.0  | 2026-01-25 |
| DECISION_CHECKLIST.md         | ✅ 完成 | 1.0  | 2026-01-25 |

**待完成**:

- ⏳ 用戶確認配置 (DECISION_CHECKLIST.md 或 RECOMMENDED_CONFIG.md)
- ⏳ 產生最終 Prisma Schema
- ⏳ 產生 Migration Script
- ⏳ 產生 Seed Script

---

## 💬 常見問題

### Q1: 我應該先讀哪一份?

**A**: 取決於你的目的:

- 想快速決策 → `RECOMMENDED_CONFIG.md`
- 想了解設計 → `GACHA_INVENTORY_FINAL_SPEC.md`
- 需要正式確認 → `DECISION_CHECKLIST.md`

### Q2: 推薦配置是強制的嗎?

**A**: 不是。推薦配置基於業界標準 (公主連結/原神) 和最佳實踐，但所有參數都可以調整。

### Q3: 如果我只想改其中一兩個參數?

**A**: 閱讀 `RECOMMENDED_CONFIG.md` 並回覆:

```
推薦配置 OK，但十連成本改為 1350
```

### Q4: 待確認事項必須全部確認嗎?

**A**: 高優先級 (🔴) 必須確認，中低優先級可以暫時使用推薦值。

### Q5: 文檔太長了，有精簡版嗎?

**A**: 是的:

- **1 頁精簡版**: `RECOMMENDED_CONFIG.md` 只有參數表
- **5 頁決策版**: `DECISION_CHECKLIST.md` 含選項說明
- **20 頁完整版**: `GACHA_INVENTORY_FINAL_SPEC.md` 含所有細節

---

## 📞 聯繫方式

如有任何疑問或建議，請透過:

- GitHub Issues
- 專案討論區
- 直接詢問開發者

---

**最後更新**: 2026-01-25  
**維護者**: Redive LineBot Team
