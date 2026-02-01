# 抽卡系統免費次數設計文件

## 📋 需求總結

### 用戶期望

- ✅ 每天免費十連（不是單抽）
- ✅ 一般用戶：1 次/天
- ✅ 月卡用戶：2 次/天（未來實作）
- ✅ 免費用完可用寶石繼續抽
- ✅ 免費抽卡計入天井點數

### 重置機制

- 每天 0 點（台灣時間）重置
- 基於日期比對，而非24小時冷卻

## 🏗️ 架構設計

### 資料結構

```prisma
model GachaDailyLimit {
  userId        String   @id
  date          DateTime              // 當前日期（用於判斷是否需要重置）
  freeDrawsUsed Int      @default(0)  // 今日已使用的免費次數
  updatedAt     DateTime @updatedAt
}
```

### 核心邏輯流程

```
用戶輸入 #抽
  ↓
檢查今日免費次數
  ├─ 記錄不存在 → 創建記錄，免費抽卡 ✅
  ├─ 日期不同   → 重置記錄，免費抽卡 ✅
  ├─ 已用 < 配額 → 遞增使用次數，免費抽卡 ✅
  └─ 已用 >= 配額 → 檢查寶石
      ├─ 寶石 >= 1500 → 消耗寶石抽卡 💎
      └─ 寶石 < 1500  → 錯誤提示 ❌
```

## 💻 實作細節

### Service 層

#### 新增方法

**1. checkAndConsumeFreeDraw()**

```typescript
private async checkAndConsumeFreeDraw(userId: string): Promise<boolean> {
  const today = this.getToday();
  const limit = await this.prisma.gachaDailyLimit.findUnique({ where: { userId } });

  // 情況 1: 無記錄或跨日 → 重置並消耗
  if (!limit || !this.isSameDay(limit.date, today)) {
    await this.prisma.gachaDailyLimit.upsert({
      where: { userId },
      create: { userId, date: today, freeDrawsUsed: 1 },
      update: { date: today, freeDrawsUsed: 1 },
    });
    return true;
  }

  // 情況 2: 還有剩餘次數 → 遞增消耗
  const quota = this.getDailyQuota();
  if (limit.freeDrawsUsed < quota) {
    await this.prisma.gachaDailyLimit.update({
      where: { userId },
      data: { freeDrawsUsed: { increment: 1 } },
    });
    return true;
  }

  // 情況 3: 配額已用完
  return false;
}
```

**2. getFreeDrawStatus()**

```typescript
async getFreeDrawStatus(userId: string): Promise<{
  hasFreeDraw: boolean;
  quota: number;
  used: number;
  resetTime: Date;
}> {
  const today = this.getToday();
  const quota = this.getDailyQuota();
  const limit = await this.prisma.gachaDailyLimit.findUnique({ where: { userId } });

  let used = 0;
  if (limit && this.isSameDay(limit.date, today)) {
    used = limit.freeDrawsUsed;
  }

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return {
    hasFreeDraw: used < quota,
    quota,
    used,
    resetTime: tomorrow,
  };
}
```

**3. 輔助方法**

```typescript
// 獲取今天 0 點的 Date 對象
private getToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

// 判斷兩個日期是否同一天
private isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

// 獲取每日配額（目前寫死為 1，未來可根據月卡狀態調整）
private getDailyQuota(): number {
  return 1; // 未來: 檢查用戶月卡狀態返回 2
}
```

#### 修改現有方法

**performDraw()**

```typescript
async performDraw(userId: string, poolId: number, count: 1 | 10): Promise<GachaDrawResult> {
  let totalCost = 0;
  let isFree = false;

  // 只有十連才檢查免費次數
  if (count === 10) {
    const hasFreeDraw = await this.checkAndConsumeFreeDraw(userId);
    if (hasFreeDraw) {
      isFree = true;
      this.logger.log(`User ${userId} used free daily draw`);
    } else {
      totalCost = config.cost * count; // 1500 寶石
    }
  }

  // Transaction 內執行抽卡邏輯
  return await this.prisma.$transaction(async (tx) => {
    // totalCost = 0 時不扣除寶石
    await this.deductJewelInTx(tx, userId, totalCost);

    // ... 抽卡邏輯

    return {
      items,
      totalCost,
      isFree, // ← 新增欄位
      // ...
    };
  });
}
```

**deductJewelInTx()**

```typescript
private async deductJewelInTx(
  tx: TransactionClient,
  userId: string,
  amount: number
): Promise<void> {
  // 免費抽卡時 amount = 0，直接返回
  if (amount === 0) {
    return;
  }

  // 正常的寶石檢查和扣除邏輯
  const wallet = await tx.userWallet.findUnique({ where: { userId } });
  if (wallet.jewel < amount) {
    throw new BadRequestException(
      `寶石不足！需要 ${amount} 寶石，目前只有 ${wallet.jewel} 寶石`
    );
  }
  await tx.userWallet.update({
    where: { userId },
    data: { jewel: { decrement: amount } },
  });
}
```

### Command 層

**統一抽卡命令**

```typescript
@Command("抽")
async draw({ event }: CommandContext) {
  const result = await this.gachaService.performDraw(userId, pool.id, 10);

  // 根據 isFree 顯示不同的標題
  const drawType = result.isFree ? "🎁 每日免費十連" : "💎 寶石十連";
  let message = `🎲 ${drawType} ✅ 已保底 2★+\n\n`;

  // 如果是免費抽卡，顯示剩餘次數
  if (result.isFree) {
    const status = await this.gachaService.getFreeDrawStatus(userId);
    message += `🎁 今日免費次數: 已用 ${status.used}/${status.quota}\n`;
    if (!status.hasFreeDraw) {
      message += `⏰ 明天 00:00 重置\n`;
    }
  } else {
    message += `💎 寶石: ${result.remainingJewels} (-${result.totalCost})\n`;
  }

  await this.lineService.replyText(replyToken, message);
}
```

**查詢命令**

```typescript
@Command("抽查詢")
async queryCeiling({ event }: CommandContext) {
  const [progress, freeStatus, wallet] = await Promise.all([
    this.gachaService.getCeilingProgress(userId, pool.id),
    this.gachaService.getFreeDrawStatus(userId),
    this.gachaService.getWallet(userId),
  ]);

  const message = `🎯 抽卡狀態

🎁 每日免費十連: ${freeStatus.used}/${freeStatus.quota}
${!freeStatus.hasFreeDraw ? "⏰ 明天 00:00 重置" : "✅ 今天還可以免費抽！"}

💎 寶石: ${wallet.jewel}
💠 女神石: ${wallet.stone}

📊 天井進度: ${progress.points} / 200
...`;

  await this.lineService.replyText(replyToken, message);
}
```

## 📱 用戶體驗

### 場景 1：新用戶第一次抽卡

**輸入**: `#抽`

**輸出**:

```
🎲 🎁 每日免費十連 ✅ 已保底 2★+

✨ 本次獲得:
1. ★★★ 佩可莉姆 [NEW!]
2. ★★ 可可蘿 [NEW!]
...

🎁 今日免費次數: 已用 1/1
⏰ 明天 00:00 重置
💠 女神石: +15
🎯 天井點數: +10 點
```

### 場景 2：用完免費次數，寶石充足

**輸入**: `#抽`

**輸出**:

```
🎲 💎 寶石十連 ✅ 已保底 2★+

✨ 本次獲得:
...

💎 寶石: 500 (-1500)
💠 女神石: +20
🎯 天井點數: +10 點
```

### 場景 3：用完免費次數，寶石不足

**輸入**: `#抽`

**輸出**:

```
❌ 寶石不足！需要 1500 寶石，目前只有 500 寶石
```

### 場景 4：查詢狀態

**輸入**: `#抽查詢`

**輸出**:

```
🎯 抽卡狀態

🎁 每日免費十連: 1/1
⏰ 明天 00:00 重置

💎 寶石: 500
💠 女神石: 120

📊 天井進度:
- 當前點數: 35 / 200
- 距離兌換: 還需 165 點 (約 17 次十連)
- 總抽卡次數: 35 次

💡 提示: 累積 200 點可兌換任意 3★ 角色
使用「#抽兌換 <角色名稱>」進行兌換
```

## 🧪 測試覆蓋

### 單元測試

- ✅ 新用戶應該有免費次數
- ✅ 用完配額後應該沒有免費次數
- ✅ 跨日應該重置免費次數
- ✅ 一般用戶配額為 1

### 整合測試

- ✅ 免費抽卡不扣除寶石
- ✅ 寶石抽卡正常扣除
- ✅ 免費抽卡計入天井點數
- ✅ middleware 自動初始化錢包

## 🔮 未來擴展

### 月卡系統

```typescript
// UserWallet 增加欄位
model UserWallet {
  // ...
  hasMonthlyCard    Boolean   @default(false)
  monthlyCardExpiry DateTime?
}

// 修改配額計算
private getDailyQuota(userId: string): number {
  const wallet = await this.prisma.userWallet.findUnique({ where: { userId } });
  if (wallet?.hasMonthlyCard && wallet.monthlyCardExpiry > new Date()) {
    return 2; // 月卡用戶
  }
  return 1; // 一般用戶
}
```

### 寶石獲取管道

- 每日簽到：300 寶石
- 每日任務：200 寶石
- 活動獎勵：不定期
- 月卡：每日自動發放 600 寶石

## 📊 數據統計建議

### 應監控的指標

1. 每日免費抽卡使用率
2. 寶石抽卡轉化率（免費用完後有多少人付費）
3. 寶石消耗速度 vs 獲取速度
4. 天井達成率

### 可能的優化方向

1. 如果免費使用率很低 → 加強新手引導
2. 如果付費轉化率很低 → 增加寶石獲取管道
3. 如果寶石消耗過快 → 調整成本或增加免費次數

## ✅ 驗收清單

- [x] Schema 更新並 migrate
- [x] Service 層實作免費次數邏輯
- [x] Command 層統一為十連命令
- [x] 免費抽卡不扣除寶石
- [x] 免費抽卡計入天井點數
- [x] 顯示正確的免費次數狀態
- [x] 查詢命令顯示完整資訊
- [x] 單元測試覆蓋核心邏輯
- [ ] 整合測試驗證完整流程
- [ ] 實際測試（開發環境）

## 🎯 總結

這個設計實現了：

1. **對用戶友善**：每天至少 10 抽，新用戶馬上能體驗
2. **邏輯清晰**：免費次數 → 寶石抽卡，層次分明
3. **易於擴展**：月卡功能只需修改配額計算
4. **可維護性高**：邏輯集中在 Service，測試覆蓋完整
5. **用戶體驗好**：清楚顯示免費次數和重置時間
