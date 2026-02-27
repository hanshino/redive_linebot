# Equipment System Design

Date: 2026-02-27

## Overview

Add an equipment system to the World Boss feature. Players can equip items in 3 slots to enhance combat attributes. Equipment management is done via LIFF; LINE chat provides a link to open the LIFF page.

## Design Decisions

- **Depth:** Simple and intuitive — 3 slots, no upgrade/enhancement system
- **Attribute model:** Hybrid — weapons use percentage bonuses, armor/accessories use flat values
- **Job restriction:** Partially job-bound — base equipment is universal, some items are job-exclusive
- **Attribute storage:** JSON `attributes` column (consistent with existing Inventory pattern, extensible without migrations)
- **UI:** LIFF page for equipment management, not Flex Message

## Database

### `equipment` Table — Equipment Definitions

| Column | Type | Description |
|--------|------|-------------|
| id | int PK AUTO_INCREMENT | |
| name | varchar(100) | Equipment name |
| slot | enum('weapon','armor','accessory') | Slot type |
| job_id | int nullable FK → minigame_job | null = universal, set = job-exclusive |
| rarity | enum('common','rare','epic','legendary') | Rarity tier |
| attributes | JSON | Flexible stats, see Attribute Keys below |
| description | text | Flavor text |
| image_url | varchar(255) nullable | Equipment icon |
| created_at | timestamp | |
| updated_at | timestamp | |

### `player_equipment` Table — Player Equipped State

| Column | Type | Description |
|--------|------|-------------|
| id | int PK AUTO_INCREMENT | |
| user_id | varchar(50) | Player ID |
| equipment_id | int FK → equipment | Equipped item |
| slot | enum('weapon','armor','accessory') | Equipped slot |
| created_at | timestamp | |
| updated_at | timestamp | |

**Constraint:** UNIQUE on (`user_id`, `slot`) — one item per slot.

### Inventory Integration

Equipment items stored in the existing `Inventory` table using itemId range 2000-2999. The `attributes` JSON stores `{"equipment_id": <id>}` to reference the `equipment` table.

### Attribute Keys (Initial)

| Key | Type | Slot | Description |
|-----|------|------|-------------|
| `atk_percent` | percentage | weapon | Attack damage bonus (0.10 = +10%) |
| `crit_rate` | percentage | weapon | Critical hit rate bonus (0.05 = +5%) |
| `cost_reduction` | flat int | armor | Reduce cost per attack (1 = -1 cost) |
| `exp_bonus` | flat int | armor/accessory | Bonus EXP per attack |
| `gold_bonus` | flat int | accessory | Bonus gold per attack |

New keys can be added at any time without schema changes.

## Damage Formula Integration

```
# Weapon (percentage-based)
finalDamage = baseDamage × (1 + weapon.atk_percent) × skillMultiplier × critMultiplier
effectiveCritRate = baseCritRate + weapon.crit_rate

# Armor (flat values)
actualCost = max(1, skillCost - armor.cost_reduction)
earnedExp += armor.exp_bonus

# Accessory (flat values)
earnedExp += accessory.exp_bonus
earnedGold += accessory.gold_bonus
```

Where `baseDamage = floor(level²) + level × 10` (unchanged).

## Interaction Design

### LINE Chat

| Command | Response |
|---------|----------|
| `#裝備` | Returns a Flex Message with a button linking to the LIFF equipment page |

Attack result messages include a one-line equipment bonus summary (e.g., "裝備加成: ATK+10%").

### LIFF Equipment Page

React page in the existing frontend, accessed via LIFF URL. Features:

- View 3 equipment slots with current items
- View backpack (unequipped equipment items)
- Equip / unequip items with tap
- Attribute summary panel

Uses LINE LIFF SDK for userId authentication.

## Backend API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/Game/Equipment/me` | Get player equipment state (3 slots + backpack) |
| POST | `/api/Game/Equipment/equip` | Equip item `{equipment_id, slot}` |
| POST | `/api/Game/Equipment/unequip` | Unequip slot `{slot}` |

Authentication: LIFF access token → userId verification.

### Admin API (equipment CRUD)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/Admin/Equipment` | List all equipment |
| GET | `/api/Admin/Equipment/:id` | Get equipment by ID |
| POST | `/api/Admin/Equipment` | Create equipment |
| PUT | `/api/Admin/Equipment/:id` | Update equipment |
| DELETE | `/api/Admin/Equipment/:id` | Delete equipment |

## Job-Exclusive Equipment

- `equipment.job_id = null` → any job can equip
- `equipment.job_id = <id>` → only that job class can equip; provides stronger bonuses as trade-off

## Acquisition (Not Implemented Yet)

Equipment is distributed manually via Admin API / admin dashboard. Future work: boss drops, shop, crafting, gacha.

## Files to Create/Modify

### New Files
- `app/migrations/YYYYMMDD_create_equipment.js` — equipment table
- `app/migrations/YYYYMMDD_create_player_equipment.js` — player_equipment table
- `app/src/model/application/Equipment.js` — Equipment model
- `app/src/model/application/PlayerEquipment.js` — PlayerEquipment model
- `app/src/service/EquipmentService.js` — Equipment business logic
- `app/src/router/Equipment/index.js` — API routes
- `app/src/handler/Equipment/admin.js` — Admin CRUD handler
- `frontend/src/components/Equipment/` — LIFF equipment page

### Modified Files
- `app/src/controller/application/WorldBossController.js` — integrate equipment bonuses into attack flow
- `app/src/templates/application/WorldBoss.js` — add equipment summary to attack result, add LIFF button for `#裝備`
- `app/src/app.js` — register `#裝備` command routing
- `app/src/router/api.js` — register equipment API routes
