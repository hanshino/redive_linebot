# Achievement System Revamp Design

## Overview

Full rebuild of the achievement system. The old `advancement` system is deprecated and replaced by two independent subsystems:

- **Achievements** — Permanent milestones, challenges, hidden discoveries, and social accomplishments. Once unlocked, never revoked.
- **Titles** — Dynamic ranking-based honors. Reassigned daily; revoked when user no longer qualifies.

Both share a unified display in the frontend and LINE Flex Messages, but are completely separate in code and data.

## Design Decisions

| Item | Decision |
|------|----------|
| Architecture | Titles (dynamic) and Achievements (permanent) as two independent systems |
| Achievement types | Milestone, Challenge, Hidden, Social |
| Rewards | Goddess stones only, auto-granted on unlock |
| Progress tracking | Tiered: unlocked = full display, known-locked = progress bar, hidden = ??? |
| Notifications | None — silent unlock, users discover on their own |
| Frontend | Game-style grid wall (Steam/Xbox style) with category tabs |
| LINE display | Summary card: stats + recent unlocks + near-completion + link to frontend |
| Initial scale | ~24 achievements across 5 categories |
| Old system | Fully removed — code, tables, and references deleted |

## Database Schema

### New Tables

#### `achievement_categories`

| Column | Type | Description |
|--------|------|-------------|
| id | int PK auto_increment | |
| key | varchar(50) unique | e.g. `chat`, `gacha`, `janken`, `world_boss`, `social` |
| name | varchar(50) | Display name, e.g. 聊天, 轉蛋 |
| icon | varchar(100) | Category icon (emoji or URL) |
| order | tinyint | Sort order |
| created_at | timestamp | |
| updated_at | timestamp | |

#### `achievements`

| Column | Type | Description |
|--------|------|-------------|
| id | int PK auto_increment | |
| category_id | int FK → achievement_categories.id | |
| key | varchar(100) unique | e.g. `chat_1000`, `janken_streak_5` |
| name | varchar(100) | Display name |
| description | varchar(255) | Unlock condition description |
| icon | varchar(100) | Achievement icon (emoji or URL) |
| type | enum('milestone','challenge','hidden','social') | |
| rarity | tinyint | 0=Common, 1=Rare, 2=Epic, 3=Legendary |
| target_value | int | Target value to unlock (e.g. 1000 messages) |
| reward_stones | int | Goddess stones awarded on unlock |
| order | tinyint | Sort within category |
| created_at | timestamp | |
| updated_at | timestamp | |

#### `user_achievements`

| Column | Type | Description |
|--------|------|-------------|
| id | int PK auto_increment | |
| user_id | varchar(50) | LINE platform user ID |
| achievement_id | int FK → achievements.id | |
| unlocked_at | timestamp | When the achievement was unlocked |

- Unique constraint on (user_id, achievement_id)
- Index on user_id

#### `user_achievement_progress`

| Column | Type | Description |
|--------|------|-------------|
| id | int PK auto_increment | |
| user_id | varchar(50) | LINE platform user ID |
| achievement_id | int FK → achievements.id | |
| current_value | int default 0 | Current progress toward target_value |
| updated_at | timestamp | Last progress update |

- Unique constraint on (user_id, achievement_id)
- Index on user_id

#### `titles`

| Column | Type | Description |
|--------|------|-------------|
| id | int PK auto_increment | |
| key | varchar(100) unique | e.g. `chat_king`, `gacha_rich` |
| name | varchar(100) | Display name |
| description | varchar(255) | |
| icon | varchar(100) | |
| rarity | tinyint | 0-3 rarity level |
| order | tinyint | Sort order |
| created_at | timestamp | |
| updated_at | timestamp | |

#### `user_titles`

| Column | Type | Description |
|--------|------|-------------|
| id | int PK auto_increment | |
| user_id | varchar(50) | LINE platform user ID |
| title_id | int FK → titles.id | |
| granted_at | timestamp | |

- Unique constraint on (user_id, title_id)
- Index on user_id

### Dropped Tables

- `advancement`
- `user_has_advancements`

## Achievement Engine

### Two Evaluation Strategies

**1. Event-based (real-time)**

For challenges, social, and hidden achievements. Called from existing controllers after the relevant action completes.

```
User wins janken → JankenController completes → AchievementEngine.evaluate(userId, "janken_win", { streak })
                                                → Engine checks related achievements → unlocks if qualified
```

Event types:
- `janken_win`, `janken_lose`, `janken_draw` — from JankenController
- `gacha_pull` — from GachaController, context includes pull results
- `chat_message` — from ChatLevel middleware, context includes groupId
- `boss_attack` — from WorldBossController, context includes damage
- `command_use` — from global order handler, context includes command name
- `group_interact` — from group-related events

**2. Cron-based (batch)**

For milestone achievements based on cumulative stats. Runs daily (replacing old AdvancementDelivery schedule). Queries existing data tables directly:
- `chat_user_data` for message counts
- Inventory tables for gacha collection counts
- `janken_rating` for match counts
- World boss tables for levels

Also handles daily title reassignment (replacing old advancement delivery logic).

### AchievementEngine Service

Location: `app/src/service/AchievementEngine.js`

Core methods:
- `evaluate(userId, eventType, context)` — Real-time evaluation. Fire-and-forget (no await in caller). On unlock: insert `user_achievements` row + add goddess stones to user.
- `batchEvaluate()` — Called by cron. Scans all users, updates progress, unlocks qualified achievements.
- `getProgress(userId, achievementId)` — Single achievement progress lookup.
- `getUserSummary(userId)` — Full achievement overview: unlocked list, progress for non-hidden, hidden count.
- `getStats()` — Global stats: per-achievement unlock rate across all users.

### Unlock Flow

```
evaluate(userId, eventType, context):
  1. Query all achievements related to eventType that user hasn't unlocked
  2. For each achievement:
     a. Get or create user_achievement_progress row
     b. Update current_value based on event type and context
     c. If current_value >= target_value:
        - Insert into user_achievements (unlocked_at = now)
        - Add reward_stones to user's goddess stone balance
        - Delete the progress row (no longer needed)
  3. Errors are logged but never propagate to the caller
```

### Integration Points

Each existing controller adds one `AchievementEngine.evaluate()` call after its core logic. This is fire-and-forget — failures are logged, never block the main flow.

| Controller | Event | Context |
|------------|-------|---------|
| GachaController | `gacha_pull` | `{ results, totalPulls }` |
| JankenController | `janken_win` / `janken_lose` | `{ streak, opponentId }` |
| ChatLevelController | `chat_message` | `{ groupId }` |
| WorldBossController | `boss_attack` | `{ damage, level }` |
| Global order handler | `command_use` | `{ command }` |

## Initial Achievement Definitions

### Chat (5)

| key | Name | Type | Condition | Rarity | Stones |
|-----|------|------|-----------|--------|--------|
| chat_100 | 話匣子 | milestone | 100 messages | Common | 50 |
| chat_1000 | 話題製造機 | milestone | 1,000 messages | Rare | 200 |
| chat_5000 | 鍵盤戰神 | milestone | 5,000 messages | Epic | 500 |
| chat_night_owl | 夜貓子 | hidden | Message between 3-4 AM (Asia/Taipei) | Rare | 150 |
| chat_multi_group | 社交蝴蝶 | social | Chat in 5 different groups | Rare | 200 |

### Gacha (5)

| key | Name | Type | Condition | Rarity | Stones |
|-----|------|------|-----------|--------|--------|
| gacha_first | 初次轉蛋 | milestone | First gacha pull | Common | 30 |
| gacha_100 | 轉蛋達人 | milestone | 100 total pulls | Rare | 200 |
| gacha_500 | 課金戰士 | milestone | 500 total pulls | Epic | 500 |
| gacha_collector_50 | 蒐藏新手 | milestone | Collect 50 unique characters | Rare | 200 |
| gacha_lucky | 歐洲人 | hidden | 3+ 3★ in a single 10-pull | Legendary | 300 |

### Janken (5)

| key | Name | Type | Condition | Rarity | Stones |
|-----|------|------|-----------|--------|--------|
| janken_first_win | 出拳入門 | milestone | First janken win | Common | 30 |
| janken_win_50 | 猜拳好手 | milestone | 50 total wins | Rare | 200 |
| janken_streak_5 | 連勝新星 | challenge | 5 win streak | Rare | 200 |
| janken_streak_10 | 不敗拳王 | challenge | 10 win streak | Epic | 500 |
| janken_challenged_10 | 眾矢之的 | social | Challenged by 10 different users | Rare | 200 |

### World Boss (4)

| key | Name | Type | Condition | Rarity | Stones |
|-----|------|------|-----------|--------|--------|
| boss_first_kill | 初陣 | milestone | First world boss participation | Common | 50 |
| boss_level_10 | 見習勇者 | milestone | World boss level 10 | Rare | 200 |
| boss_level_50 | 精英冒險者 | milestone | World boss level 50 | Epic | 500 |
| boss_top_damage | 一刀入魂 | hidden | #1 single-hit damage in any world boss fight | Legendary | 300 |

### Social (5)

| key | Name | Type | Condition | Rarity | Stones |
|-----|------|------|-----------|--------|--------|
| social_first_command | 指令新手 | milestone | Use any command for the first time | Common | 30 |
| social_all_features | 全能玩家 | challenge | Use chat, gacha, janken, and world boss at least once | Epic | 300 |
| social_veteran_30d | 老玩家 | milestone | Account age > 30 days | Rare | 150 |
| social_invite_group | 推廣大使 | hidden | Be in a group when bot is invited | Rare | 200 |
| social_easter_egg | 彩蛋獵人 | hidden | Trigger a hidden easter egg command | Legendary | 300 |

## Title System

Titles reuse the same logic as the old advancement delivery but with clean code. The cron job (`TitleDelivery.js`) runs daily at 3 AM:

1. Clear all user_titles
2. Evaluate current rankings from data tables
3. Assign titles to qualifying users

Initial titles (same as current advancements):
- Chat: 話語霸權, 話術小丑, 話語大師 (top 3 chatters)
- Gacha: 轉蛋蒐藏家/藝術家/家 (top 3 collectors), 女神富豪/貴族/騎士 (top 3 spenders)
- Janken: 拳王, 猜拳小菜鳥, 輸到脫褲, 平局高手
- World Boss: 攻略組 (top 1%), 躺分組 (bottom 1%)
- System: 至高神 (admin only, manually assigned)

## Backend Architecture

### File Structure

```
app/src/
├── controller/application/
│   └── AchievementController.js   # LINE commands + admin commands
├── model/application/
│   ├── Achievement.js             # Achievement definitions
│   ├── AchievementCategory.js     # Categories
│   ├── UserAchievement.js         # Unlock records
│   ├── UserAchievementProgress.js # Progress tracking
│   ├── Title.js                   # Title definitions
│   └── UserTitle.js               # User-title assignments
├── service/
│   └── AchievementEngine.js       # Core engine
├── templates/application/
│   └── Achievement.js             # LINE Flex Message templates
├── bin/
│   ├── AchievementCron.js         # Daily batch evaluation
│   └── TitleDelivery.js           # Daily title reassignment
└── router/
    └── api.js                     # New /api/achievements endpoints
```

### LINE Commands

| Command | Function |
|---------|----------|
| `.成就` | Personal achievement summary (Flex Message) |
| `.稱號` | Current titles |
| `!achievement list` | Admin: list all achievements |
| `!achievement seed` | Admin: initialize seed data |

### API Endpoints

| Route | Method | Function |
|-------|--------|----------|
| /api/achievements | GET | All achievements with categories |
| /api/achievements/user/:userId | GET | User achievement status with progress |
| /api/achievements/stats | GET | Global unlock rate per achievement |
| /api/titles/user/:userId | GET | User title list |

### Removed Files

- `app/src/model/application/Advancement.js`
- `app/src/controller/application/AdvancementController.js`
- `app/src/templates/application/Advancement.js`
- `app/bin/AdvancementDelivery.js`
- All `advancement` references in `app/src/app.js`

## Frontend: Achievement Wall

### Layout: Grid Wall (Steam-style)

Page route: `/achievements` (or `/achievements/:userId` for viewing other users)

Components:
- **Header** — Total progress bar: "12 / 24 Unlocked (50%)"
- **Category Tabs** — All | Chat | Gacha | Janken | Boss | Social
- **Achievement Grid** — Cards in responsive grid (3 cols desktop, 2 cols mobile)

### Achievement Card States

1. **Unlocked** — Colored border matching rarity, glowing shadow, icon + name + "Unlocked" badge
2. **In Progress** — Normal border, icon + name + progress bar + "732/1000"
3. **Hidden (locked)** — Achievements with `type = 'hidden'` that are not yet unlocked. Dimmed, ??? icon and name, "Hidden" label
4. **Hidden (unlocked)** — Achievements with `type = 'hidden'` that are unlocked. Same as unlocked but with a special "Hidden" badge

### Rarity Colors

| Rarity | Color | Border/Glow |
|--------|-------|-------------|
| Common | #a0a0a0 | Gray |
| Rare | #6c5ce7 | Purple |
| Epic | #ffd700 | Gold |
| Legendary | #fd79a8 | Pink |

### Tech Stack

Follows existing frontend patterns: React 17, Material-UI, axios for API calls. New page added to react-router.

## LINE Flex Message: Summary Card

Single bubble with four sections:

1. **Header** — Gradient background, total count "12 / 24", progress bar, completion percentage
2. **Recent Unlocks** — Last 3 unlocked achievements with icon, name, time ago, rarity badge
3. **Almost There** — 1-2 achievements closest to completion, with progress bar and percentage
4. **Footer CTA** — "View All Achievements →" linking to the frontend achievement wall (LIFF or external URL)

If user has no achievements: simple message encouraging them to explore bot features.

## Migration Strategy

### Database Migrations

1. Create `achievement_categories` table
2. Create `achievements` table
3. Create `user_achievements` table
4. Create `user_achievement_progress` table
5. Create `titles` table
6. Create `user_titles` table
7. Seed initial achievement categories and definitions
8. Seed initial title definitions (migrated from config)
9. Drop `user_has_advancements` table
10. Drop `advancement` table

### Code Migration

1. Build new model layer (Achievement, AchievementCategory, UserAchievement, UserAchievementProgress, Title, UserTitle)
2. Build AchievementEngine service
3. Build new controller and templates
4. Add API endpoints
5. Integrate evaluate() calls into existing controllers
6. Build frontend achievement wall page
7. Replace old cron jobs with new AchievementCron + TitleDelivery
8. Remove all old advancement code and references
9. Update i18n locale file
10. Update analytics tracking
