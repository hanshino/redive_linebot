# Redive LineBot - Migration TODO List

## Bottender → NestJS Migration Plan

**Created**: 2026-01-25  
**Status**: Planning Phase  
**Branch**: `master` (Bottender) → `dev` (NestJS)

---

## 📊 Migration Overview

### Already Implemented in NestJS ✅

- [x] LineModule (webhook handling, signature validation)
- [x] Middleware runner (onion model)
- [x] UserSyncModule (background job processing)
- [x] PermissionModule (authorization)
- [x] GroupConfigModule (group settings)
- [x] Infrastructure (Redis, Prisma, BullMQ, Queue)
- [x] Health check endpoints
- [x] Basic middleware (Echo, Logging, RateLimit, UserTrack, Permission)

### To Be Migrated 🎯

- **7 Middleware components**
- **38+ Controllers** (Princess, Application, Admin)
- **Command routing system**
- **Postback handling**
- **Event processing pipeline**

---

## 🏗️ Migration Phases

### **Phase 0: Foundation & Shared Infrastructure** 🔧

**Priority**: CRITICAL (Must complete before Phase 1)  
**Complexity**: High  
**Estimated Effort**: 2-3 days

#### Shared Components to Build First

| Component                    | Description                                                            | Delegation Strategy                             | Priority |
| ---------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- | -------- |
| **Command Router Service**   | Central command pattern matching & routing (replaces Bottender router) | `category="ultrabrain"`, `load_skills=[]`       | P0       |
| **Postback Handler**         | Handle LINE postback events (buttons, quick replies)                   | `category="unspecified-high"`, `load_skills=[]` | P0       |
| **Message Template Builder** | Flex message, carousel, bubble templates                               | `category="unspecified-low"`, `load_skills=[]`  | P1       |
| **LINE Profile Service**     | Fetch & cache user/group profiles                                      | `category="quick"`, `load_skills=[]`            | P0       |
| **Event Type Guards**        | NestJS guards for different event types                                | `category="quick"`, `load_skills=[]`            | P1       |

#### Middleware Migration (Remaining)

| Middleware                | Function                                | Current Status                        | Delegation Strategy                            |
| ------------------------- | --------------------------------------- | ------------------------------------- | ---------------------------------------------- |
| **alias.js**              | Command alias replacement via Redis     | ❌ Not migrated                       | `category="quick"`, `load_skills=[]`           |
| **config.js**             | Load guild configs into context         | ⚠️ Partial (GroupConfigModule exists) | `category="quick"`, `load_skills=[]`           |
| **dcWebhook.js**          | Forward messages to Discord webhook     | ❌ Not migrated                       | `category="unspecified-low"`, `load_skills=[]` |
| **profile.js**            | Identity resolution (LINE → DB mapping) | ⚠️ Partial (UserSyncModule exists)    | `category="quick"`, `load_skills=[]`           |
| **statistics.js**         | Event logging + Socket.io emit          | ❌ Not migrated                       | `category="unspecified-low"`, `load_skills=[]` |
| **validation.js**         | Security & auth validation              | ⚠️ Partial (SignatureGuard exists)    | `category="quick"`, `load_skills=[]`           |
| **recordLatestGroupUser** | Track recent group users in Redis       | ❌ Not migrated                       | `category="quick"`, `load_skills=[]`           |

**Testing Checkpoint**: All middleware functional, command router handles basic text commands

---

### **Phase 1: Core Game Systems** 🎮

**Priority**: HIGH  
**Complexity**: Medium-High  
**Estimated Effort**: 5-7 days

#### Princess Controllers (Gacha Game Core)

| Controller        | Commands                                            | Complexity                   | Delegation Strategy                             | Priority |
| ----------------- | --------------------------------------------------- | ---------------------------- | ----------------------------------------------- | -------- |
| **gacha.js**      | `#抽`, `#消耗抽`, `#歐洲抽`, `#保證抽`, `#我的包包` | High (RNG, inventory, rates) | `category="unspecified-high"`, `load_skills=[]` | P0       |
| **battle.js**     | `#gbs`, `#gbc`, `#gb`, `#刀表`, `#出完三刀`         | High (scheduling, sign-ups)  | `category="unspecified-high"`, `load_skills=[]` | P0       |
| **character.js**  | `#升星`, `#升滿星`                                  | Medium (character data)      | `category="unspecified-low"`, `load_skills=[]`  | P1       |
| **GodStoneShop/** | `#轉蛋兌換`, `#轉蛋商店`                            | Medium (exchange system)     | `category="unspecified-low"`, `load_skills=[]`  | P1       |

**Models Required**:

- `GachaModel` (gacha pool, rates)
- `InventoryModel` (user inventory)
- `GachaRecord` (gacha history)
- `BattleModel` (sign-up, schedule)

**Testing Checkpoint**: Gacha pulls work, battle sign-ups functional, inventory persists

---

### **Phase 2: Social & Progression Systems** 👥

**Priority**: HIGH  
**Complexity**: Medium  
**Estimated Effort**: 4-5 days

#### Social Controllers

| Controller                 | Commands                                     | Complexity                   | Delegation Strategy                             | Priority |
| -------------------------- | -------------------------------------------- | ---------------------------- | ----------------------------------------------- | -------- |
| **ChatLevelController.js** | `#我的狀態`, `#等級排行`, `#你的狀態`        | Medium (EXP, levels, ranks)  | `category="unspecified-low"`, `load_skills=[]`  | P0       |
| **WorldBossController.js** | `#世界王`, `#攻擊`, `#冒險小卡`, `#夢幻回歸` | High (event system, boss HP) | `category="unspecified-high"`, `load_skills=[]` | P0       |
| **MarketController.js**    | `#轉帳`, `#快速轉帳`, `#atm`                 | Medium (money transfer)      | `category="unspecified-low"`, `load_skills=[]`  | P1       |
| **VoteController.js**      | Vote commands                                | Medium (voting logic)        | `category="unspecified-low"`, `load_skills=[]`  | P1       |

**Models Required**:

- `ChatLevel` (user EXP, level)
- `WorldBoss` (boss events, attacks)
- `Currency` (user balance)
- `Vote` (voting records)

**Testing Checkpoint**: Chat levels accumulate, world boss attacks work, transfers succeed

---

### **Phase 3: Mini-Games & Entertainment** 🎲

**Priority**: MEDIUM  
**Complexity**: Medium  
**Estimated Effort**: 4-6 days

#### Game Controllers

| Controller                   | Commands                        | Complexity                      | Delegation Strategy                             | Priority |
| ---------------------------- | ------------------------------- | ------------------------------- | ----------------------------------------------- | -------- |
| **JankenController.js**      | `#決鬥`, `#猜拳擂台`, `#duel`   | Medium (PvP, postback)          | `category="unspecified-low"`, `load_skills=[]`  | P1       |
| **LotteryController.js**     | `#樂透`, `#買樂透`, `#電腦選號` | Medium (lottery draw, numbers)  | `category="unspecified-low"`, `load_skills=[]`  | P1       |
| **ScratchCardController.js** | `#刮刮卡`, `#購買刮刮卡`        | Medium (card inventory, prizes) | `category="unspecified-low"`, `load_skills=[]`  | P1       |
| **NumberController.js**      | `#猜` (dice game)               | Medium (RNG, betting)           | `category="unspecified-low"`, `load_skills=[]`  | P2       |
| **GambleController.js**      | Gambling commands               | Medium (betting system)         | `category="unspecified-low"`, `load_skills=[]`  | P2       |
| **JobController.js**         | `#轉職` (RPG jobs)              | High (job quests, postback)     | `category="unspecified-high"`, `load_skills=[]` | P1       |

**Models Required**:

- `Janken` (duel records)
- `Lottery` (lottery tickets, draws)
- `ScratchCard` (card types, user cards)
- `Job` (user jobs, quests)

**Testing Checkpoint**: All mini-games functional, postback interactions work

---

### **Phase 4: System & Admin Features** ⚙️

**Priority**: MEDIUM  
**Complexity**: Low-Medium  
**Estimated Effort**: 3-4 days

#### System Controllers

| Controller                 | Commands                              | Complexity                         | Delegation Strategy                            | Priority |
| -------------------------- | ------------------------------------- | ---------------------------------- | ---------------------------------------------- | -------- |
| **CustomerOrder.js**       | `#新增指令`, `#刪除指令`, `#指令列表` | Medium (custom commands)           | `category="unspecified-low"`, `load_skills=[]` | P1       |
| **GroupConfig.js**         | `#自訂頭像`, `#群組設定`              | Low (already in GroupConfigModule) | `category="quick"`, `load_skills=[]`           | P2       |
| **SubscribeController.js** | `#訂閱兌換`, subscription cmds        | Medium (subscription system)       | `category="unspecified-low"`, `load_skills=[]` | P1       |
| **CouponController.js**    | `#兌換` (coupon code)                 | Low (code validation)              | `category="quick"`, `load_skills=[]`           | P2       |
| **ImageController.js**     | Image handling commands               | Medium (image processing)          | `category="unspecified-low"`, `load_skills=[]` | P2       |
| **StatusController.js**    | Status display commands               | Low (status queries)               | `category="quick"`, `load_skills=[]`           | P2       |

#### Admin Controllers

| Controller                   | Commands      | Complexity              | Delegation Strategy                  | Priority |
| ---------------------------- | ------------- | ----------------------- | ------------------------------------ | -------- |
| **AdvancementController.js** | `!adv add`    | Low (admin CRUD)        | `category="quick"`, `load_skills=[]` | P2       |
| **AliasController.js**       | `!alias`      | Low (alias management)  | `category="quick"`, `load_skills=[]` | P2       |
| **DonateListController.js**  | `!donate add` | Low (donation tracking) | `category="quick"`, `load_skills=[]` | P2       |

**Testing Checkpoint**: Custom commands work, subscriptions functional, admin tools operational

---

### **Phase 5: AI & Advanced Features** 🤖

**Priority**: LOW  
**Complexity**: Medium-High  
**Estimated Effort**: 3-5 days

#### Advanced Controllers

| Controller                     | Commands                     | Complexity                 | Delegation Strategy                            | Priority |
| ------------------------------ | ---------------------------- | -------------------------- | ---------------------------------------------- | -------- |
| **OpenaiController.js**        | AI chat, `@mention bot`      | High (OpenAI API, session) | `category="ultrabrain"`, `load_skills=[]`      | P2       |
| **BullshitController.js**      | `#幹話` (bullshit generator) | Low (text generation)      | `category="quick"`, `load_skills=[]`           | P3       |
| **AdvertisementController.js** | Ad management                | Medium (ad system)         | `category="unspecified-low"`, `load_skills=[]` | P3       |
| **GuildServiceController.js**  | Guild services               | Medium (guild features)    | `category="unspecified-low"`, `load_skills=[]` | P2       |

#### Special Features

| Feature              | Description                        | Delegation Strategy                             | Priority |
| -------------------- | ---------------------------------- | ----------------------------------------------- | -------- |
| **interactWithBot**  | Handle @mentions, natural language | `category="ultrabrain"`, `load_skills=[]`       | P2       |
| **GlobalOrderBase**  | Global cross-group commands        | `category="unspecified-high"`, `load_skills=[]` | P1       |
| **Nothing fallback** | Default response handler           | `category="quick"`, `load_skills=[]`            | P3       |

**Testing Checkpoint**: AI chat functional, global commands work, all features integrated

---

## 📋 Detailed Migration Checklist

### Phase 0: Foundation ✅ / ❌

- [ ] **Command Router Service**
  - [ ] Pattern matching engine (regex, text)
  - [ ] Route registration system
  - [ ] Context injection
  - [ ] Error handling
- [ ] **Postback Handler Service**
  - [ ] Payload parsing
  - [ ] Cooldown mechanism (Redis)
  - [ ] Action routing
- [ ] **Message Template Builder**
  - [ ] Flex message builder
  - [ ] Carousel template
  - [ ] Bubble template
  - [ ] Quick reply builder
- [ ] **LINE Profile Service**
  - [ ] User profile fetcher
  - [ ] Group summary fetcher
  - [ ] Redis caching layer
  - [ ] LINE ID → DB ID mapping
- [ ] **Middleware Migration**
  - [ ] Alias middleware
  - [ ] Config middleware (enhance existing)
  - [ ] Discord webhook middleware
  - [ ] Profile middleware (enhance existing)
  - [ ] Statistics middleware
  - [ ] Validation middleware (enhance existing)
  - [ ] Latest group user tracker

### Phase 1: Core Game Systems ✅ / ❌

- [ ] **Gacha System**
  - [ ] Gacha pool loader
  - [ ] RNG engine
  - [ ] Inventory service
  - [ ] Gacha record tracking
  - [ ] Commands: `#抽`, `#消耗抽`, `#歐洲抽`, `#保證抽`
  - [ ] Command: `#我的包包`
- [ ] **Battle System**
  - [ ] Battle sign-up service
  - [ ] Battle scheduling
  - [ ] Week management
  - [ ] Commands: `#gbs`, `#gbc`, `#gb`, `#刀表`
  - [ ] Commands: `#出完三刀`, `#重置三刀`, `#五王倒了`
- [ ] **Character System**
  - [ ] Character data service
  - [ ] Star rank-up logic
  - [ ] Commands: `#升星`, `#升滿星`
- [ ] **God Stone Shop**
  - [ ] Shop item service
  - [ ] Exchange logic
  - [ ] Commands: `#轉蛋兌換`, `#轉蛋商店`

### Phase 2: Social & Progression ✅ / ❌

- [ ] **Chat Level System**
  - [ ] EXP calculation service
  - [ ] Level progression
  - [ ] Ranking service
  - [ ] Commands: `#我的狀態`, `#等級排行`, `#你的狀態`
- [ ] **World Boss System**
  - [ ] Boss event scheduler
  - [ ] Attack mechanics
  - [ ] HP tracking
  - [ ] Commands: `#世界王`, `#攻擊`, `#冒險小卡`
- [ ] **Market System**
  - [ ] Transfer service
  - [ ] Balance validation
  - [ ] Transaction logging
  - [ ] Commands: `#轉帳`, `#快速轉帳`
- [ ] **Vote System**
  - [ ] Vote creation
  - [ ] Vote tracking
  - [ ] Vote decision via postback

### Phase 3: Mini-Games ✅ / ❌

- [ ] **Janken (Rock-Paper-Scissors)**
  - [ ] Duel service
  - [ ] Challenge holder system
  - [ ] Commands: `#決鬥`, `#猜拳擂台`
- [ ] **Lottery System**
  - [ ] Lottery draw service
  - [ ] Number generation
  - [ ] Prize distribution
  - [ ] Commands: `#樂透`, `#買樂透`, `#電腦選號`
- [ ] **Scratch Card System**
  - [ ] Card inventory
  - [ ] Prize reveal logic
  - [ ] Commands: `#刮刮卡`, `#購買刮刮卡`
- [ ] **Number/Dice Game**
  - [ ] Dice roll service
  - [ ] Betting system
  - [ ] Command: `#猜`
- [ ] **Gamble System**
  - [ ] Gamble mechanics
  - [ ] Admin result setting
- [ ] **Job System**
  - [ ] Job change quests
  - [ ] Job missions (Swordman, Mage, Thief)
  - [ ] Command: `#轉職`

### Phase 4: System & Admin ✅ / ❌

- [ ] **Custom Order System**
  - [ ] Order creation
  - [ ] Order deletion
  - [ ] Order detection
  - [ ] Commands: `#新增指令`, `#刪除指令`
- [ ] **Group Config**
  - [ ] Custom sender (already exists)
  - [ ] Group status display
  - [ ] Commands: `#自訂頭像`, `#群組設定`
- [ ] **Subscribe System**
  - [ ] Subscription management
  - [ ] Coupon exchange
  - [ ] Commands: `#訂閱兌換`
- [ ] **Coupon System**
  - [ ] Coupon validation
  - [ ] Redemption logic
  - [ ] Command: `#兌換`
- [ ] **Image Controller**
  - [ ] Image processing
  - [ ] Image commands
- [ ] **Status Controller**
  - [ ] Status queries
- [ ] **Admin Tools**
  - [ ] Advancement management
  - [ ] Alias management
  - [ ] Donation tracking
  - [ ] EXP/rate setting

### Phase 5: AI & Advanced ✅ / ❌

- [ ] **OpenAI Integration**
  - [ ] Chat session management
  - [ ] Natural language understanding
  - [ ] Bot mention handling
  - [ ] Command: `/resetsession`
- [ ] **Bullshit Generator**
  - [ ] Text generation service
  - [ ] Command: `#幹話`
- [ ] **Advertisement System**
  - [ ] Ad display service
- [ ] **Guild Service**
  - [ ] Guild-related features
- [ ] **Global Orders**
  - [ ] Cross-group command system
- [ ] **Fallback Handler**
  - [ ] Default response for unmatched commands

---

## 🧪 Testing Strategy

### Per-Phase Testing

1. **Unit Tests**: Each service/controller method (Vitest)
2. **Integration Tests**: Controller + Service + Database (mocked)
3. **E2E Tests**: Full webhook → response flow (critical paths only)

### Test Coverage Goals

- **Phase 0**: 80%+ coverage on shared infrastructure
- **Phase 1-3**: 70%+ coverage on business logic
- **Phase 4-5**: 60%+ coverage (admin/advanced features)

### Manual Testing Checkpoints

- [ ] Phase 0: Command routing works, middleware chain functional
- [ ] Phase 1: Gacha pulls, battle sign-ups, character upgrades
- [ ] Phase 2: Chat levels, world boss attacks, money transfers
- [ ] Phase 3: All mini-games playable end-to-end
- [ ] Phase 4: Custom commands, subscriptions, admin tools
- [ ] Phase 5: AI chat, global commands, edge cases

---

## 📈 Progress Tracking

### Overall Migration Status

- **Phase 0**: 🔴 Not Started (0/7 middleware, 0/5 shared components)
- **Phase 1**: 🔴 Not Started (0/4 controllers)
- **Phase 2**: 🔴 Not Started (0/4 controllers)
- **Phase 3**: 🔴 Not Started (0/6 controllers)
- **Phase 4**: 🔴 Not Started (0/9 controllers)
- **Phase 5**: 🔴 Not Started (0/4 controllers)

### Legend

- 🔴 Not Started
- 🟡 In Progress
- 🟢 Completed
- ⚠️ Blocked/Issues

---

## 🎯 Success Criteria

### Phase Completion Criteria

Each phase is considered complete when:

1. ✅ All controllers/middleware implemented
2. ✅ Unit tests written and passing
3. ✅ Integration tests passing
4. ✅ Manual testing checkpoint passed
5. ✅ Code review completed
6. ✅ Documentation updated

### Final Migration Success

- [ ] All 38+ controllers migrated
- [ ] All 7 middleware migrated
- [ ] All command patterns functional
- [ ] Test coverage >70%
- [ ] Performance benchmarks met (response time <500ms)
- [ ] No regressions in existing features
- [ ] Production deployment successful

---

## 📝 Notes & Considerations

### Architecture Decisions

1. **Command Router**: Use decorator-based routing (similar to NestJS controllers) vs. centralized router service
2. **Postback Handling**: Integrate with command router or separate service?
3. **Message Templates**: Use a template engine or build Flex messages programmatically?
4. **Middleware Order**: Maintain same order as Bottender or optimize for NestJS?

### Potential Blockers

- **Complex postback flows**: JobController has multi-step postback interactions
- **OpenAI API**: Session management, token limits
- **Discord webhook**: Network reliability, error handling
- **Redis dependencies**: Ensure Redis is always available for rate limiting, caching

### Migration Tips

- **Start with simplest controllers** to establish patterns
- **Reuse existing services** (RedisService, PrismaService, LineService)
- **Keep original code as reference** until migration is verified
- **Test incrementally** - don't wait until full phase completion
- **Document breaking changes** in command syntax or behavior

---

## 🔗 Related Documentation

- [AGENTS.md](../AGENTS.md) - Development guidelines
- [Backend README](../apps/backend/README.md) - NestJS setup
- [Prisma Schema](../apps/backend/prisma/schema.prisma) - Database models

---

**Last Updated**: 2026-01-25  
**Maintained By**: Redive LineBot Migration Team
