# Gacha Banner 系統 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立管理員可設定的轉蛋 Banner 系統，支援「期間限定機率提升（rate_up）」與「歐洲抽（europe）」兩種活動類型，前端提供管理介面，後端自動在抽卡時套用當前有效的 banner。

**Architecture:** 新增 `gacha_banner` + `gacha_banner_characters` 兩張資料表。後端新增 GachaBanner model + CRUD API。Controller 抽卡時查詢當前有效 banner，對指定角色套用倍率（rate_up）或開放歐洲抽（europe）。前端新增 `/admin/gacha-banner` 管理頁面。現有 pickup 指令邏輯完全不動。

**Tech Stack:** Knex migrations, CommonJS model (extends Base), Express routes, React + MUI frontend

---

## File Structure

### 新建檔案

| 檔案 | 職責 |
|------|------|
| `app/migrations/20260406120000_create_gacha_banner.js` | 建立 `gacha_banner` 表 |
| `app/migrations/20260406120001_create_gacha_banner_characters.js` | 建立 `gacha_banner_characters` 關聯表 |
| `app/src/model/princess/GachaBanner.js` | GachaBanner model (extends Base) |
| `app/src/controller/princess/GachaBannerController.js` | Banner CRUD API controller |
| `frontend/src/services/gachaBanner.js` | 前端 API service |
| `frontend/src/pages/Admin/GachaBanner/index.jsx` | Banner 列表管理頁 |
| `frontend/src/pages/Admin/GachaBanner/GachaBannerForm.jsx` | Banner 新增/編輯表單頁 |

### 修改檔案

| 檔案 | 修改內容 |
|------|----------|
| `app/src/router/api.js` | 新增 `/api/admin/gacha-banners` CRUD routes |
| `app/src/controller/princess/gacha.js` | 抽卡時查詢 active banner 並套用倍率；歐洲抽改查 banner 表 |
| `frontend/src/App.jsx` | 新增 banner 管理路由 |
| `frontend/src/components/NavDrawer.jsx` | admin menu 新增「活動 Banner」項目 |

---

## Task 1: 建立 gacha_banner 資料表 migration

**Files:**
- Create: `app/migrations/20260406120000_create_gacha_banner.js`

- [ ] **Step 1: 建立 migration 檔案**

```javascript
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("gacha_banner", function (table) {
    table.increments("id").primary();
    table.string("name", 100).notNullable().comment("Banner 名稱");
    table.enum("type", ["rate_up", "europe"]).notNullable().comment("活動類型");
    table.integer("rate_boost").unsigned().defaultTo(0).comment("機率加成百分比，僅 rate_up 用，如 150 表示 1.5 倍");
    table.integer("cost").unsigned().defaultTo(0).comment("花費女神石，僅 europe 用，0 表示用 config 預設");
    table.timestamp("start_at").notNullable().comment("活動開始時間");
    table.timestamp("end_at").notNullable().comment("活動結束時間");
    table.boolean("is_active").notNullable().defaultTo(true).comment("是否啟用");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("gacha_banner");
};
```

- [ ] **Step 2: 驗證 migration 可執行**

Run: `cd /home/hanshino/workspace/redive_linebot/app && npx knex migrate:latest --dry-run 2>&1 || echo "dry-run not supported, check syntax only"`

---

## Task 2: 建立 gacha_banner_characters 關聯表 migration

**Files:**
- Create: `app/migrations/20260406120001_create_gacha_banner_characters.js`

- [ ] **Step 1: 建立 migration 檔案**

```javascript
// eslint-disable-next-line no-unused-vars
const { Knex } = require("knex");

/**
 * @param {Knex} knex
 */
exports.up = function (knex) {
  return knex.schema.createTable("gacha_banner_characters", function (table) {
    table.increments("id").primary();
    table.integer("banner_id").unsigned().notNullable().comment("對應 gacha_banner.id");
    table.integer("character_id").unsigned().notNullable().comment("對應 GachaPool.id");

    table.foreign("banner_id").references("gacha_banner.id").onDelete("CASCADE");
    table.unique(["banner_id", "character_id"]);
  });
};

/**
 * @param {Knex} knex
 */
exports.down = function (knex) {
  return knex.schema.dropTable("gacha_banner_characters");
};
```

- [ ] **Step 2: Commit migrations**

```bash
git add app/migrations/20260406120000_create_gacha_banner.js app/migrations/20260406120001_create_gacha_banner_characters.js
git commit -m "feat(db): add gacha_banner and gacha_banner_characters migrations"
```

---

## Task 3: 建立 GachaBanner Model

**Files:**
- Create: `app/src/model/princess/GachaBanner.js`

- [ ] **Step 1: 建立 model 檔案**

```javascript
const Base = require("../base");

class GachaBanner extends Base {
  constructor() {
    super({
      table: "gacha_banner",
      fillable: [
        "name",
        "type",
        "rate_boost",
        "cost",
        "start_at",
        "end_at",
        "is_active",
      ],
    });
  }

  /**
   * 查詢當前有效的 banner（時間內且啟用中）
   * @param {Object} options
   * @param {String} options.type 活動類型 rate_up | europe
   * @returns {Promise<Array>}
   */
  async getActiveBanners(options = {}) {
    const now = new Date();
    let query = this.knex
      .where("is_active", true)
      .where("start_at", "<=", now)
      .where("end_at", ">=", now);

    if (options.type) {
      query = query.where("type", options.type);
    }

    return query.orderBy("start_at", "desc");
  }

  /**
   * 取得 banner 的關聯角色 ID 列表
   * @param {Number} bannerId
   * @returns {Promise<Array<Number>>}
   */
  async getBannerCharacterIds(bannerId) {
    const rows = await this.connection("gacha_banner_characters")
      .where("banner_id", bannerId)
      .select("character_id");
    return rows.map(r => r.character_id);
  }

  /**
   * 設定 banner 的關聯角色（先刪後插）
   * @param {Number} bannerId
   * @param {Array<Number>} characterIds
   */
  async setBannerCharacters(bannerId, characterIds) {
    await this.connection("gacha_banner_characters")
      .where("banner_id", bannerId)
      .del();

    if (characterIds.length > 0) {
      await this.connection("gacha_banner_characters").insert(
        characterIds.map(characterId => ({
          banner_id: bannerId,
          character_id: characterId,
        }))
      );
    }
  }

  /**
   * 取得 banner 詳情（含關聯角色）
   * @param {Number} id
   * @returns {Promise<Object|null>}
   */
  async findWithCharacters(id) {
    const banner = await this.find(id);
    if (!banner) return null;

    const characterIds = await this.getBannerCharacterIds(id);
    return { ...banner, characterIds };
  }
}

module.exports = new GachaBanner();
```

- [ ] **Step 2: Commit**

```bash
git add app/src/model/princess/GachaBanner.js
git commit -m "feat(model): add GachaBanner model with active banner query"
```

---

## Task 4: 建立 GachaBanner CRUD Controller

**Files:**
- Create: `app/src/controller/princess/GachaBannerController.js`

- [ ] **Step 1: 建立 controller 檔案**

```javascript
const GachaBanner = require("../../model/princess/GachaBanner");

/**
 * 取得所有 banner 列表
 */
async function listBanners(req, res) {
  try {
    const banners = await GachaBanner.all({
      order: [{ column: "start_at", direction: "desc" }],
    });
    res.json(banners);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "取得 banner 列表失敗" });
  }
}

/**
 * 取得單一 banner 詳情（含角色）
 */
async function getBanner(req, res) {
  try {
    const { id } = req.params;
    const banner = await GachaBanner.findWithCharacters(parseInt(id));
    if (!banner) {
      return res.status(404).json({ message: "Banner 不存在" });
    }
    res.json(banner);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "取得 banner 失敗" });
  }
}

/**
 * 新增 banner
 * body: { name, type, rate_boost, cost, start_at, end_at, is_active, characterIds }
 */
async function createBanner(req, res) {
  try {
    const { characterIds = [], ...bannerData } = req.body;
    const id = await GachaBanner.create(bannerData);

    if (bannerData.type === "rate_up" && characterIds.length > 0) {
      await GachaBanner.setBannerCharacters(id, characterIds);
    }

    res.json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "新增 banner 失敗" });
  }
}

/**
 * 更新 banner
 * body: { name, type, rate_boost, cost, start_at, end_at, is_active, characterIds }
 */
async function updateBanner(req, res) {
  try {
    const { id } = req.params;
    const { characterIds, ...bannerData } = req.body;

    await GachaBanner.update(parseInt(id), {
      ...bannerData,
      updated_at: new Date(),
    });

    if (characterIds !== undefined) {
      await GachaBanner.setBannerCharacters(parseInt(id), characterIds);
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "更新 banner 失敗" });
  }
}

/**
 * 刪除 banner（cascade 會自動刪除關聯角色）
 */
async function deleteBanner(req, res) {
  try {
    const { id } = req.params;
    await GachaBanner.delete(parseInt(id));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "刪除 banner 失敗" });
  }
}

module.exports = {
  listBanners,
  getBanner,
  createBanner,
  updateBanner,
  deleteBanner,
};
```

- [ ] **Step 2: Commit**

```bash
git add app/src/controller/princess/GachaBannerController.js
git commit -m "feat(controller): add GachaBanner CRUD API controller"
```

---

## Task 5: 註冊 Banner API Routes

**Files:**
- Modify: `app/src/router/api.js`

- [ ] **Step 1: 在 api.js 新增 routes**

在 `api.js` 頂部 require 區塊（約 line 18 附近）加入：

```javascript
const GachaBannerController = require("../controller/princess/GachaBannerController");
```

在 line 205（`router.delete("/admin/gacha-pool/:id"...` 下方）加入：

```javascript
/**
 * 轉蛋 Banner 管理
 */
router.get("/admin/gacha-banners", verifyPrivilege(1), GachaBannerController.listBanners);
router.get("/admin/gacha-banners/:id", verifyPrivilege(1), GachaBannerController.getBanner);
router.post("/admin/gacha-banners", verifyPrivilege(9), GachaBannerController.createBanner);
router.put("/admin/gacha-banners/:id", verifyPrivilege(9), GachaBannerController.updateBanner);
router.delete("/admin/gacha-banners/:id", verifyPrivilege(9), GachaBannerController.deleteBanner);
```

- [ ] **Step 2: Commit**

```bash
git add app/src/router/api.js
git commit -m "feat(router): register gacha banner admin API routes"
```

---

## Task 6: 修改 gacha controller — 套用 banner 機率加成

**Files:**
- Modify: `app/src/controller/princess/gacha.js`

這是核心改動。需要在抽卡流程中查詢當前有效 banner 並套用。

- [ ] **Step 1: 在 gacha.js 頂部加入 require**

在 line 15（`const GachaRecord = require(...)` 附近）加入：

```javascript
const GachaBanner = require("../../model/princess/GachaBanner");
```

- [ ] **Step 2: 新增 applyBannerRateUp 函式**

在 `makePickup` 函式（line 152-160）後面加入：

```javascript
/**
 * 對 banner 指定的角色套用機率加成
 * @param {Array} pool 轉蛋池
 * @param {Array<Number>} characterIds banner 指定角色 ID
 * @param {Number} rateBoost 加成百分比，如 150 = 1.5 倍
 * @returns {Array}
 */
function applyBannerRateUp(pool, characterIds, rateBoost) {
  return pool.map(data => {
    if (!characterIds.includes(data.id)) return data;
    return {
      ...data,
      rate: `${(parseFloat(data.rate) * (100 + rateBoost)) / 100}%`,
    };
  });
}
```

- [ ] **Step 3: 修改 gacha 函式中的歐洲抽時間判斷與池子組裝**

將 line 184-191 的硬寫時間判斷：

```javascript
  const now = moment();
  const month = now.month() + 1;
  const date = now.date();
  const isEventTime = month === 1 && date >= 27 && date <= 31;

  // 只有 12/31~1/1 這兩天才會開放歐洲轉蛋池
  if (europe && !isEventTime) {
    return context.replyText(i18n.__("message.gacha.cross_year_only"));
  }
```

改為：

```javascript
  const now = moment();

  // 歐洲抽：查詢是否有進行中的 europe banner
  if (europe) {
    const europeBanners = await GachaBanner.getActiveBanners({ type: "europe" });
    if (europeBanners.length === 0) {
      return context.replyText(i18n.__("message.gacha.cross_year_only"));
    }
  }
```

- [ ] **Step 4: 修改池子組裝邏輯，加入 banner rate_up**

將 line 266-275 的 dailyPool 組裝：

```javascript
  const dailyPool = (() => {
    if (pickup) {
      return makePickup(filteredPool, 200);
    } else if (ensure) {
      return filteredPool;
    } else if (europe) {
      return filteredPool.filter(data => data.star == "3");
    }
    return filteredPool;
  })();
```

改為：

```javascript
  // 查詢當前有效的 rate_up banner
  const rateUpBanners = await GachaBanner.getActiveBanners({ type: "rate_up" });

  const dailyPool = await (async () => {
    let pool = filteredPool;

    // 先套用 banner rate_up（管理員設定，自動生效）
    for (const banner of rateUpBanners) {
      const bannerCharIds = await GachaBanner.getBannerCharacterIds(banner.id);
      if (bannerCharIds.length > 0) {
        pool = applyBannerRateUp(pool, bannerCharIds, banner.rate_boost);
      }
    }

    // 再套用玩家指令效果
    if (pickup) {
      return makePickup(pool, 200);
    } else if (ensure) {
      return pool;
    } else if (europe) {
      return pool.filter(data => data.star == "3");
    }
    return pool;
  })();
```

- [ ] **Step 5: 驗證程式碼無語法錯誤**

Run: `cd /home/hanshino/workspace/redive_linebot/app && node -e "require('./src/controller/princess/gacha')"`

- [ ] **Step 6: Commit**

```bash
git add app/src/controller/princess/gacha.js
git commit -m "feat(gacha): integrate banner system for rate-up and europe scheduling"
```

---

## Task 7: 建立前端 API Service

**Files:**
- Create: `frontend/src/services/gachaBanner.js`

- [ ] **Step 1: 建立 service 檔案**

```javascript
import api from "./api";

export const fetchBanners = () =>
  api.get("/api/admin/gacha-banners").then(r => r.data);

export const fetchBanner = (id) =>
  api.get(`/api/admin/gacha-banners/${id}`).then(r => r.data);

export const createBanner = (data) =>
  api.post("/api/admin/gacha-banners", data).then(r => r.data);

export const updateBanner = (id, data) =>
  api.put(`/api/admin/gacha-banners/${id}`, data).then(r => r.data);

export const deleteBanner = (id) =>
  api.delete(`/api/admin/gacha-banners/${id}`).then(r => r.data);
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/services/gachaBanner.js
git commit -m "feat(frontend): add gachaBanner API service"
```

---

## Task 8: 建立前端 Banner 列表管理頁

**Files:**
- Create: `frontend/src/pages/Admin/GachaBanner/index.jsx`

- [ ] **Step 1: 建立列表頁面**

```jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Typography,
  Chip,
  IconButton,
  Stack,
  Paper,
  Tooltip,
  Divider,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import CelebrationIcon from "@mui/icons-material/Celebration";
import { FullPageLoading } from "../../../components/Loading";
import HintSnackBar from "../../../components/HintSnackBar";
import AlertDialog from "../../../components/AlertDialog";
import useHintBar from "../../../hooks/useHintBar";
import useAlertDialog from "../../../hooks/useAlertDialog";
import * as gachaBannerService from "../../../services/gachaBanner";

const TYPE_CONFIG = {
  rate_up: { label: "機率提升", color: "warning" },
  europe: { label: "歐洲抽", color: "info" },
};

function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-TW");
}

function isActive(banner) {
  if (!banner.is_active) return false;
  const now = new Date();
  return new Date(banner.start_at) <= now && new Date(banner.end_at) >= now;
}

export default function AdminGachaBanner() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === "dark";

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();
  const [alertState, { handleOpen: showAlert, handleClose: closeAlert }] = useAlertDialog();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await gachaBannerService.fetchBanners();
      setRows(data);
    } catch {
      showHint("載入資料失敗", "error");
    } finally {
      setLoading(false);
    }
  }, [showHint]);

  useEffect(() => {
    document.title = "活動 Banner 管理";
    fetchData();
  }, [fetchData]);

  const handleDeleteClick = (row) => {
    showAlert({
      title: "確認刪除",
      description: `確定要刪除 Banner「${row.name}」嗎？`,
      onSubmit: async () => {
        try {
          await gachaBannerService.deleteBanner(row.id);
          showHint("刪除成功", "success");
          fetchData();
        } catch {
          showHint("刪除失敗", "error");
        } finally {
          closeAlert();
        }
      },
    });
  };

  if (loading && rows.length === 0) {
    return <FullPageLoading />;
  }

  return (
    <Box sx={{ width: "100%" }}>
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2, sm: 3 },
          mb: 3,
          borderRadius: 3,
          border: 1,
          borderColor: "divider",
          background: isDark
            ? "linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(168,85,247,0.06) 100%)"
            : "linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(168,85,247,0.04) 100%)",
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              活動 Banner 管理
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
              共 {rows.length} 個 Banner
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate("/admin/gacha-banner/new")}
            sx={{ borderRadius: 2, px: 2.5, boxShadow: 2 }}
          >
            新增 Banner
          </Button>
        </Stack>
      </Paper>

      {/* Banner List */}
      <Paper elevation={0} sx={{ borderRadius: 3, border: 1, borderColor: "divider" }}>
        {rows.length === 0 && (
          <Box sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary">
              尚無 Banner 資料
            </Typography>
          </Box>
        )}
        {rows.map((banner, index) => (
          <Box key={banner.id}>
            {index > 0 && <Divider />}
            <Box
              sx={{
                px: { xs: 2.5, sm: 3 },
                py: { xs: 2, sm: 2.5 },
                display: "flex",
                alignItems: "center",
                gap: 2,
              }}
            >
              <CelebrationIcon
                sx={{
                  fontSize: 32,
                  color: isActive(banner) ? "warning.main" : "text.disabled",
                }}
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {banner.name}
                  </Typography>
                  <Chip
                    label={TYPE_CONFIG[banner.type]?.label || banner.type}
                    color={TYPE_CONFIG[banner.type]?.color || "default"}
                    size="small"
                  />
                  {isActive(banner) ? (
                    <Chip label="進行中" color="success" size="small" variant="outlined" />
                  ) : (
                    <Chip label="未啟用" size="small" variant="outlined" />
                  )}
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {formatDateTime(banner.start_at)} ～ {formatDateTime(banner.end_at)}
                </Typography>
                {banner.type === "rate_up" && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    機率加成: {banner.rate_boost}%
                  </Typography>
                )}
                {banner.type === "europe" && banner.cost > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    花費: {banner.cost} 女神石
                  </Typography>
                )}
              </Box>
              <Stack direction="row" spacing={0.5}>
                <Tooltip title="編輯" arrow>
                  <IconButton
                    size="small"
                    onClick={() => navigate(`/admin/gacha-banner/${banner.id}/edit`)}
                    sx={{ color: "primary.main" }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="刪除" arrow>
                  <IconButton
                    size="small"
                    onClick={() => handleDeleteClick(banner)}
                    sx={{ color: "error.main" }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>
          </Box>
        ))}
      </Paper>

      <AlertDialog
        open={alertState.open}
        onClose={closeAlert}
        onSubmit={alertState.onSubmit}
        onCancel={closeAlert}
        title={alertState.title}
        description={alertState.description}
      />
      <HintSnackBar
        open={hintState.open}
        message={hintState.message}
        severity={hintState.severity}
        onClose={closeHint}
      />
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Admin/GachaBanner/index.jsx
git commit -m "feat(frontend): add gacha banner list admin page"
```

---

## Task 9: 建立前端 Banner 表單頁

**Files:**
- Create: `frontend/src/pages/Admin/GachaBanner/GachaBannerForm.jsx`

- [ ] **Step 1: 建立表單頁面**

```jsx
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  TextField,
  MenuItem,
  Typography,
  Stack,
  Paper,
  IconButton,
  Chip,
  Autocomplete,
  Switch,
  FormControlLabel,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import HintSnackBar from "../../../components/HintSnackBar";
import { FullPageLoading } from "../../../components/Loading";
import useHintBar from "../../../hooks/useHintBar";
import * as gachaBannerService from "../../../services/gachaBanner";
import * as gachaPoolService from "../../../services/gachaPool";

const TYPE_OPTIONS = [
  { value: "rate_up", label: "機率提升" },
  { value: "europe", label: "歐洲抽" },
];

const EMPTY_FORM = {
  name: "",
  type: "rate_up",
  rate_boost: 150,
  cost: 0,
  start_at: "",
  end_at: "",
  is_active: true,
  characterIds: [],
};

function toLocalDateTimeString(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export default function GachaBannerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isDark = theme.palette.mode === "dark";
  const isEdit = Boolean(id);

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hintState, { handleOpen: showHint, handleClose: closeHint }] = useHintBar();

  const fetchInitialData = useCallback(async () => {
    try {
      setLoading(true);
      const poolData = await gachaPoolService.fetchData();
      const ssrCharacters = poolData
        .filter((c) => parseInt(c.star, 10) === 3)
        .map((c) => ({ id: c.id, name: c.name, imageUrl: c.imageUrl }));
      setCharacters(ssrCharacters);

      if (isEdit) {
        const banner = await gachaBannerService.fetchBanner(id);
        setFormData({
          name: banner.name || "",
          type: banner.type || "rate_up",
          rate_boost: banner.rate_boost || 0,
          cost: banner.cost || 0,
          start_at: toLocalDateTimeString(banner.start_at),
          end_at: toLocalDateTimeString(banner.end_at),
          is_active: Boolean(banner.is_active),
          characterIds: banner.characterIds || [],
        });
      }
    } catch {
      showHint("載入資料失敗", "error");
    } finally {
      setLoading(false);
    }
  }, [id, isEdit, showHint]);

  useEffect(() => {
    document.title = isEdit ? "編輯 Banner" : "新增 Banner";
    fetchInitialData();
  }, [isEdit, fetchInitialData]);

  const handleChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      showHint("請輸入 Banner 名稱", "warning");
      return;
    }
    if (!formData.start_at || !formData.end_at) {
      showHint("請設定活動時間", "warning");
      return;
    }
    if (new Date(formData.start_at) >= new Date(formData.end_at)) {
      showHint("結束時間必須晚於開始時間", "warning");
      return;
    }

    const payload = {
      name: formData.name,
      type: formData.type,
      rate_boost: formData.type === "rate_up" ? parseInt(formData.rate_boost, 10) : 0,
      cost: formData.type === "europe" ? parseInt(formData.cost, 10) : 0,
      start_at: new Date(formData.start_at).toISOString(),
      end_at: new Date(formData.end_at).toISOString(),
      is_active: formData.is_active,
      characterIds: formData.type === "rate_up" ? formData.characterIds : [],
    };

    try {
      setSaving(true);
      if (isEdit) {
        await gachaBannerService.updateBanner(Number(id), payload);
      } else {
        await gachaBannerService.createBanner(payload);
      }
      showHint(isEdit ? "更新成功" : "新增成功", "success");
      setTimeout(() => navigate("/admin/gacha-banner"), 800);
    } catch {
      showHint(isEdit ? "更新失敗" : "新增失敗", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <FullPageLoading />;
  }

  const selectedCharacters = characters.filter((c) =>
    formData.characterIds.includes(c.id)
  );

  return (
    <Box sx={{ width: "100%", maxWidth: 640, mx: "auto", pb: 10 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
        <IconButton
          onClick={() => navigate("/admin/gacha-banner")}
          sx={{
            bgcolor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
            "&:hover": { bgcolor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)" },
          }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          {isEdit ? "編輯 Banner" : "新增 Banner"}
        </Typography>
      </Stack>

      {/* Form */}
      <Paper
        elevation={0}
        sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 3, border: 1, borderColor: "divider" }}
      >
        <Stack spacing={2.5}>
          <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 700 }}>
            基本設定
          </Typography>

          <TextField
            fullWidth
            label="Banner 名稱"
            value={formData.name}
            onChange={handleChange("name")}
            required
          />

          <TextField
            fullWidth
            select
            label="活動類型"
            value={formData.type}
            onChange={handleChange("type")}
          >
            {TYPE_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>

          <FormControlLabel
            control={
              <Switch
                checked={formData.is_active}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, is_active: e.target.checked }))
                }
              />
            }
            label="啟用"
          />

          {/* 時間設定 */}
          <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 700, mt: 1 }}>
            活動時間
          </Typography>

          <Stack direction={isMobile ? "column" : "row"} spacing={2}>
            <TextField
              fullWidth
              label="開始時間"
              type="datetime-local"
              value={formData.start_at}
              onChange={handleChange("start_at")}
              required
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              fullWidth
              label="結束時間"
              type="datetime-local"
              value={formData.end_at}
              onChange={handleChange("end_at")}
              required
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>

          {/* rate_up 專用欄位 */}
          {formData.type === "rate_up" && (
            <>
              <Typography
                variant="overline"
                sx={{ color: "text.secondary", fontWeight: 700, mt: 1 }}
              >
                機率提升設定
              </Typography>

              <TextField
                fullWidth
                label="機率加成 (%)"
                value={formData.rate_boost}
                onChange={handleChange("rate_boost")}
                type="number"
                helperText="例如 150 表示指定角色機率變為 (100+150)/100 = 2.5 倍"
                slotProps={{ htmlInput: { min: 0, step: 10 } }}
              />

              <Autocomplete
                multiple
                options={characters}
                getOptionLabel={(option) => option.name}
                value={selectedCharacters}
                onChange={(_, newValue) =>
                  setFormData((prev) => ({
                    ...prev,
                    characterIds: newValue.map((c) => c.id),
                  }))
                }
                isOptionEqualToValue={(option, value) => option.id === value.id}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip
                      label={option.name}
                      size="small"
                      {...getTagProps({ index })}
                      key={option.id}
                    />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="選擇加成角色（僅 SSR）"
                    placeholder="搜尋角色名稱..."
                  />
                )}
              />
            </>
          )}

          {/* europe 專用欄位 */}
          {formData.type === "europe" && (
            <>
              <Typography
                variant="overline"
                sx={{ color: "text.secondary", fontWeight: 700, mt: 1 }}
              >
                歐洲抽設定
              </Typography>

              <TextField
                fullWidth
                label="花費女神石"
                value={formData.cost}
                onChange={handleChange("cost")}
                type="number"
                helperText="設為 0 則使用系統預設值 (10,000)"
                slotProps={{ htmlInput: { min: 0, step: 100 } }}
              />
            </>
          )}
        </Stack>
      </Paper>

      {/* Sticky Save Button */}
      <Box
        sx={{
          position: "fixed",
          bottom: 0,
          left: { xs: 0, md: 260 },
          right: 0,
          p: 2,
          bgcolor: "background.paper",
          borderTop: 1,
          borderColor: "divider",
          zIndex: (t) => t.zIndex.appBar - 1,
          backdropFilter: "blur(8px)",
          backgroundColor: isDark ? "rgba(10,26,42,0.92)" : "rgba(255,255,255,0.92)",
        }}
      >
        <Box sx={{ maxWidth: 640, mx: "auto" }}>
          <Button
            fullWidth
            variant="contained"
            size="large"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saving}
            sx={{ py: 1.5, fontWeight: 700, fontSize: "1rem", borderRadius: 2, boxShadow: 3 }}
          >
            {saving ? "儲存中..." : isEdit ? "儲存變更" : "新增 Banner"}
          </Button>
        </Box>
      </Box>

      <HintSnackBar
        open={hintState.open}
        message={hintState.message}
        severity={hintState.severity}
        onClose={closeHint}
      />
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Admin/GachaBanner/GachaBannerForm.jsx
git commit -m "feat(frontend): add gacha banner create/edit form page"
```

---

## Task 10: 註冊前端路由與導覽選單

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/NavDrawer.jsx`

- [ ] **Step 1: 修改 App.jsx — 加入 import**

在 import 區塊（line 28-29 附近，AdminGachaPool 下方）加入：

```javascript
import AdminGachaBanner from "./pages/Admin/GachaBanner";
import AdminGachaBannerForm from "./pages/Admin/GachaBanner/GachaBannerForm";
```

- [ ] **Step 2: 修改 App.jsx — 加入路由**

在 `admin/gacha-pool/:id/edit` 路由（line 85）下方加入：

```jsx
          <Route path="admin/gacha-banner" element={<AdminGachaBanner />} />
          <Route path="admin/gacha-banner/new" element={<AdminGachaBannerForm />} />
          <Route path="admin/gacha-banner/:id/edit" element={<AdminGachaBannerForm />} />
```

- [ ] **Step 3: 修改 NavDrawer.jsx — 加入選單項目**

在 `NavDrawer.jsx` 的 `adminItems` 陣列（line 54-62），在第一項「轉蛋管理」後面加入：

```javascript
  { label: "活動 Banner", path: "/admin/gacha-banner", icon: CelebrationIcon },
```

並在頂部 import 區加入：

```javascript
import CelebrationIcon from "@mui/icons-material/Celebration";
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/NavDrawer.jsx
git commit -m "feat(frontend): register gacha banner routes and nav menu item"
```

---

## Task 11: 歐洲抽 europe banner 花費支援

**Files:**
- Modify: `app/src/controller/princess/gacha.js`

- [ ] **Step 1: 修改歐洲抽的花費邏輯**

在 Task 6 Step 3 修改後的歐洲抽判斷處，將查到的 europe banner 存為變數，供後續花費使用。

將 Step 3 中的歐洲抽判斷改為：

```javascript
  // 歐洲抽：查詢是否有進行中的 europe banner
  let activeEuropeBanner = null;
  if (europe) {
    const europeBanners = await GachaBanner.getActiveBanners({ type: "europe" });
    if (europeBanners.length === 0) {
      return context.replyText(i18n.__("message.gacha.cross_year_only"));
    }
    activeEuropeBanner = europeBanners[0];
  }
```

然後修改 line 246 附近的 `europeCost` 計算：

將：
```javascript
  const europeCost = config.get("gacha.europe_cost");
```

改為：
```javascript
  const europeCost = (activeEuropeBanner && activeEuropeBanner.cost > 0)
    ? activeEuropeBanner.cost
    : config.get("gacha.europe_cost");
```

- [ ] **Step 2: Commit**

```bash
git add app/src/controller/princess/gacha.js
git commit -m "feat(gacha): support dynamic europe banner cost from admin config"
```

---

## Task 12: 整合驗證

- [ ] **Step 1: 執行 migration**

Run: `cd /home/hanshino/workspace/redive_linebot/app && npx knex migrate:latest`

- [ ] **Step 2: 執行後端 lint**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn lint`

- [ ] **Step 3: 執行後端測試**

Run: `cd /home/hanshino/workspace/redive_linebot/app && yarn test`

- [ ] **Step 4: 執行前端 build 驗證**

Run: `cd /home/hanshino/workspace/redive_linebot/frontend && yarn build`

- [ ] **Step 5: 修正任何 lint/test/build 錯誤**

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: fix lint and build issues for gacha banner feature"
```
