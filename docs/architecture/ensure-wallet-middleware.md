# EnsureWalletMiddleware 設計文件

## 背景問題

在實作抽卡功能時，發現新用戶在第一次使用時會因為沒有 wallet 資料而拋出錯誤：

```
BadRequestException: Wallet not found. Please contact support.
```

## 初始解決方案的問題

第一個解決方案是在 `GachaService.performDraw()` 中的 transaction 內部創建錢包：

```typescript
// ❌ 問題：在 transaction 內創建錢包
await this.prisma.$transaction(async (tx) => {
  // 如果錢包不存在，在這裡創建
  let wallet = await tx.userWallet.findUnique({ where: { userId } });
  if (!wallet) {
    wallet = await tx.userWallet.create({
      data: { userId, jewel: 0, stone: 0 },
    });
  }

  // 檢查寶石是否足夠
  if (wallet.jewel < amount) {
    throw new BadRequestException("寶石不足"); // ⚠️ 這裡會 rollback
  }
  // ...
});
```

**問題**：

- 新用戶第一次使用時，錢包在 transaction 內創建
- 檢查寶石時發現不足，拋出錯誤
- **整個 transaction rollback，包括剛創建的錢包** ❌
- 用戶下次再嘗試，還是會遇到 "Wallet not found" 錯誤

## 第二個解決方案的問題

在 transaction 外部創建錢包：

```typescript
// 在 transaction 外部確保錢包存在
await this.ensureWalletExists(userId);

await this.prisma.$transaction(async (tx) => {
  // transaction 內的操作
});
```

**問題**：

- 雖然解決了 rollback 問題
- 但每個需要錢包的 service 都要記得調用 `ensureWalletExists()`
- **邏輯分散**，容易遺漏
- 違反 DRY 原則

## 最終解決方案：EnsureWalletMiddleware

### 設計理念

將 "確保用戶基礎資料存在" 的邏輯集中在 **middleware** 層，作為所有操作的前置條件。

### 架構優點

1. ✅ **統一管理**：所有 LINE 事件都會經過這個 middleware
2. ✅ **關注點分離**：Service 只需專注業務邏輯，不用管基礎資料初始化
3. ✅ **可預期的狀態**：進入 controller 時，保證用戶的錢包已經存在
4. ✅ **避免重複代碼**：不用在每個 service 都寫一次
5. ✅ **易於擴展**：未來可以在同一個地方初始化其他基礎資料

### Middleware 執行順序

```
用戶請求
  ↓
1. RateLimitMiddleware      → 防止濫用
  ↓
2. LoggingMiddleware         → 記錄事件
  ↓
3. UserTrackMiddleware       → 追蹤用戶活動
  ↓
4. EnsureWalletMiddleware    → ✨ 確保錢包存在（新增）
  ↓
5. PermissionMiddleware      → 檢查權限
  ↓
6. CommandDispatcherMiddleware → 路由到對應的 handler
  ↓
實際的業務邏輯（Controller/Service）
```

### 實作細節

```typescript
@Injectable()
export class EnsureWalletMiddleware implements LineMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async handle(ctx: MiddlewareContext, next: NextFunction): Promise<void> {
    const userId = ctx.event.source?.userId;

    if (userId) {
      await this.ensureWalletExists(userId);
    }

    await next();
  }

  private async ensureWalletExists(userId: string): Promise<void> {
    const existingWallet = await this.prisma.userWallet.findUnique({
      where: { userId },
    });

    if (!existingWallet) {
      await this.prisma.userWallet.create({
        data: {
          userId,
          jewel: 0,
          stone: 0,
        },
      });
      this.logger.log(`Auto-initialized wallet for user: ${userId}`);
    }
  }
}
```

### Service 層簡化

**之前**：

```typescript
async performDraw(userId: string, poolId: number, count: 1 | 10) {
  await this.ensureWalletExists(userId); // ❌ 每個 service 都要記得調用

  return await this.prisma.$transaction(async (tx) => {
    // ...
  });
}
```

**現在**：

```typescript
async performDraw(userId: string, poolId: number, count: 1 | 10) {
  // ✅ 不用擔心錢包是否存在，middleware 已經處理好了

  return await this.prisma.$transaction(async (tx) => {
    // 直接進入業務邏輯
  });
}
```

## 測試覆蓋

已實作完整的單元測試：

- ✅ 錢包不存在時自動創建
- ✅ 錢包已存在時不重複創建
- ✅ 沒有 userId 時跳過處理
- ✅ 正確調用 next() 繼續 middleware 鏈

## 未來擴展

這個 middleware 可以輕鬆擴展來初始化其他用戶基礎資料：

```typescript
private async ensureUserDataExists(userId: string): Promise<void> {
  // 確保錢包存在
  await this.ensureWalletExists(userId);

  // 未來可以添加其他初始化邏輯
  // await this.ensureInventoryExists(userId);
  // await this.ensureSettingsExists(userId);
}
```

## 總結

通過引入 `EnsureWalletMiddleware`，我們：

1. 解決了 transaction rollback 導致錢包無法創建的問題
2. 統一了用戶基礎資料的初始化邏輯
3. 簡化了 Service 層的代碼
4. 提供了良好的擴展性

這是一個典型的 **關注點分離** 和 **DRY 原則** 的實踐案例。
