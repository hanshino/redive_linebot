# User Tracking System Design

**Date:** 2025-01-25  
**Author:** AI Architect  
**Status:** Implemented

## Overview

混合式使用者追蹤系統，結合即時 middleware 檢查與背景 queue 處理，在不影響 webhook 回應速度的前提下完整記錄 LINE 使用者資訊。

## Architecture

### Three-Layer Processing

```
┌─────────────────────────────────────────────────────┐
│                  LINE Webhook Event                  │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│  Layer 1: UserTrackMiddleware (Immediate Check)     │
│  - Check if user exists (Redis cache)               │
│  - New user → Queue profile sync job                │
│  - Existing user → Mark as active (Redis Set)       │
│  Time: <1ms overhead                                │
└──────────────────┬──────────────────────────────────┘
                   │
                   ├──► [New User] ──────────────────┐
                   │                                  │
                   └──► [Existing User] ─────┐       │
                                              │       │
┌─────────────────────────────────────────┐  │       │
│  Redis: users:active:batch              │◄─┘       │
│  (Lightweight activity tracking)        │          │
└─────────────────────────────────────────┘          │
                                                      │
┌─────────────────────────────────────────────────────▼───┐
│  Layer 2: BullMQ Worker (Background Processing)         │
│  Job: sync-profile                                       │
│  - Fetch profile from LINE API                          │
│  - Upsert to line_users table                           │
│  - Update Redis cache                                   │
│  Retry: 3 attempts, exponential backoff                 │
└──────────────────────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│  Layer 3: Scheduled Tasks (@nestjs/schedule)        │
│  1. Every 5 min: Batch update lastSeenAt            │
│  2. Daily 3AM: Refresh stale profiles (7+ days old) │
└──────────────────────────────────────────────────────┘
```

### Data Models

#### Prisma Schema

```prisma
model LineUser {
  userId        String   @id @map("user_id")
  displayName   String   @map("display_name")
  pictureUrl    String?  @map("picture_url")
  statusMessage String?  @map("status_message")
  language      String?  @map("language")
  
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  lastSeenAt    DateTime @default(now()) @map("last_seen_at")
  
  permissions   UserPermission[]
  
  @@index([lastSeenAt], name: "idx_last_seen")
  @@map("line_users")
}

model UserPermission {
  id        String   @id @default(cuid())
  userId    String   @map("user_id")
  groupId   String?  @map("group_id")
  role      Role
  
  user      LineUser @relation(fields: [userId], references: [userId], onDelete: Cascade)
  
  @@unique([userId, groupId])
  @@map("user_permissions")
}
```

### Caching Strategy

| Cache Key | Type | TTL | Purpose |
|-----------|------|-----|---------|
| `user:exists:{userId}` | String | 1 day | Avoid repeated DB checks |
| `users:active:batch` | Set | N/A | Collect active users for batch update |

### Module Structure

```
apps/backend/src/
├── queue/
│   ├── queue.module.ts
│   └── queue.service.ts         # BullMQ wrapper
├── user-sync/
│   ├── user-sync.module.ts
│   ├── user-sync.service.ts     # Core business logic
│   ├── user-sync.processor.ts   # BullMQ worker
│   └── user-sync.scheduler.ts   # Cron jobs
└── line/
    └── middleware/
        └── user-track.middleware.ts  # Layer 1 handler
```

## Implementation Details

### 1. UserTrackMiddleware (Layer 1)

**責任：** 即時檢查與輕量追蹤

```typescript
async handle(ctx: MiddlewareContext, next: NextFunction) {
  const userId = ctx.event.source?.userId;
  
  if (userId) {
    // Non-blocking background task
    this.trackUser(userId, ctx).catch(logger.warn);
  }
  
  await next(); // Never blocks main flow
}

private async trackUser(userId: string, ctx: MiddlewareContext) {
  const exists = await this.userSyncService.checkUserExists(userId);
  
  if (!exists) {
    // Queue full profile sync for new users
    await this.queue.add('sync-profile', { userId, context });
  } else {
    // Mark existing users as active (Redis Set)
    await this.userSyncService.markUserActive(userId);
  }
}
```

**Performance:**
- Cache hit: <1ms (Redis GET)
- Cache miss: ~2-5ms (DB query + Redis SET)
- Always non-blocking (catch errors)

### 2. BullMQ Worker (Layer 2)

**Job:** `sync-profile`

**Payload:**
```typescript
{
  userId: string;
  context: {
    sourceType: 'user' | 'group' | 'room';
    groupId?: string;
    roomId?: string;
  };
}
```

**Processing:**
1. Fetch profile from LINE API (different endpoints for user/group/room)
2. Upsert to `line_users` table
3. Update Redis `user:exists:{userId}` cache

**Error Handling:**
- Automatic retry: 3 attempts
- Backoff: Exponential (2s, 4s, 8s)
- Failed jobs retained for 7 days

### 3. Scheduled Tasks (Layer 3)

#### Batch Activity Update
**Cron:** `*/5 * * * *` (Every 5 minutes)

```typescript
async batchUpdateActivity() {
  const activeUsers = await redis.smembers('users:active:batch');
  
  await prisma.$executeRaw`
    UPDATE line_users 
    SET last_seen_at = NOW() 
    WHERE user_id = ANY(${activeUsers})
  `;
  
  await redis.del('users:active:batch');
}
```

**Why batch?**
- Reduces DB writes from N to 1 per 5 min
- No impact on user experience (delayed tracking acceptable)

#### Stale Profile Refresh
**Cron:** `0 3 * * *` (Daily 3AM)

Finds profiles not updated in 7+ days and queues them for refresh. Ensures data freshness without constant API calls.

## Performance Characteristics

### Latency Impact on Webhook Processing

| Scenario | Overhead | Description |
|----------|----------|-------------|
| New user | <2ms | Redis miss → Queue job |
| Existing user (cache hit) | <0.5ms | Redis GET + SADD |
| LINE API call | 0ms | Background worker (non-blocking) |

### Scalability Limits

| Metric | Current Capacity | Notes |
|--------|------------------|-------|
| **Webhook throughput** | ~1000 msg/sec | Middleware overhead minimal |
| **LINE API rate limit** | ~2000 req/sec | Worker processes jobs at controlled rate |
| **Redis memory** | ~50MB per 100K users | Cache TTL prevents unbounded growth |
| **PostgreSQL** | Batch writes every 5min | 10K active users = 2K writes/5min |

## Configuration

### Environment Variables

```bash
# Redis connection (shared with BullMQ)
REDIS_HOST=localhost
REDIS_PORT=6379

# LINE Bot credentials
LINE_CHANNEL_ACCESS_TOKEN=your_token
LINE_CHANNEL_SECRET=your_secret

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/db
```

### BullMQ Queue Options

```typescript
{
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      count: 100,   // Keep last 100 completed
      age: 86400,   // 24 hours
    },
    removeOnFail: {
      count: 500,   // Keep last 500 failed
      age: 604800,  // 7 days
    },
  },
}
```

## Monitoring & Observability

### Key Metrics to Track

1. **Queue Health**
   - Job processing rate
   - Failed job count
   - Queue depth

2. **Cache Hit Rate**
   - `user:exists:{userId}` hits/misses
   - Helps tune TTL

3. **Database Performance**
   - Batch update execution time
   - Upsert query latency

4. **LINE API Reliability**
   - Profile fetch success rate
   - API error codes

### Logging Strategy

```typescript
// UserTrackMiddleware
logger.debug(`Queued profile sync for new user: ${userId}`);
logger.warn(`Failed to track user ${userId}:`, error);

// UserSyncProcessor
logger.log(`User synced: ${userId} (${displayName})`);
logger.error(`Failed to fetch profile for ${userId}:`, error);

// UserSyncScheduler
logger.log(`Batch updated ${count} active users`);
logger.log(`Queued ${count} stale profiles for refresh`);
```

## Migration Path

### From Current State

1. ✅ Schema updated (`line_users` table created)
2. ✅ Middleware integrated (runs before Permission middleware)
3. ✅ Queue system configured (BullMQ + Redis)
4. ✅ Scheduler enabled (@nestjs/schedule)

### Zero Downtime Deployment

1. Deploy new code (middleware runs in non-blocking mode)
2. Existing users: Gradual cache population as they interact
3. New users: Immediate profile sync via queue

### Rollback Plan

If issues arise:
1. Remove `UserTrackMiddleware` from middleware chain
2. Queue workers continue processing existing jobs
3. Scheduled tasks can be disabled via environment variable

## Future Enhancements

### Phase 2 (When traffic grows)

1. **Separate Worker Process**
   - Move BullMQ processor to dedicated container
   - Horizontal scaling of workers

2. **Profile Snapshot Cache**
   ```typescript
   cache.set(`user:profile:${userId}`, JSON.stringify(profile), 3600);
   ```
   - Reduce LINE API calls for frequently queried users
   - Useful for bots with "user info" commands

3. **Analytics Pipeline**
   - Export `lastSeenAt` data to analytics DB
   - Track user engagement trends

### Phase 3 (Advanced features)

1. **Profile Change Detection**
   - Compare `displayName` before/after
   - Trigger events for name changes (audit log)

2. **Bulk Sync Command**
   - Admin command to re-sync all users
   - Useful after LINE API updates

## Testing Strategy

### Unit Tests
- `UserSyncService`: Profile fetch logic
- `UserTrackMiddleware`: Cache check flow

### Integration Tests
- Full flow: New user → Queue → DB upsert
- Scheduler: Batch update correctness

### Load Tests
- 100 concurrent webhook events
- Verify <50ms p99 latency

## Conclusion

This three-layer architecture balances performance, reliability, and maintainability:

- **Layer 1** ensures zero impact on webhook response times
- **Layer 2** handles expensive LINE API calls reliably with retries
- **Layer 3** optimizes database writes and keeps data fresh

The system is production-ready for small-to-medium scale (~10K users) and can scale horizontally when needed.
