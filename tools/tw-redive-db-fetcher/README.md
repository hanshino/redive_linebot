# TW Redive Master DB Fetcher

自動下載並更新公主連結 TW 伺服器的 master database (`redive_tw.db`)。

## 安裝

需要 Python 3.10+ 和 [uv](https://docs.astral.sh/uv/)。

```bash
# 安裝 uv（如果尚未安裝）
curl -LsSf https://astral.sh/uv/install.sh | sh

# 進入工具目錄
cd tools/tw-redive-db-fetcher

# 安裝依賴（uv 會自動建立虛擬環境）
uv sync
```

## 使用方式

所有指令都在 `tools/tw-redive-db-fetcher/` 目錄下執行。

### CDN 模式（預設）

自動猜測最新版本號，從 CDN 下載 Unity AssetBundle，解壓縮並提取 SQLite DB。

```bash
uv run python main.py
```

### GitHub 模式

從 [Expugn/priconne-database](https://github.com/Expugn/priconne-database) 下載，適合 CDN 無法存取時使用。

```bash
uv run python main.py --github-only
```

### 強制更新

跳過 hash 比對，強制重新下載（僅限 GitHub 模式）。

```bash
uv run python main.py --github-only --force
```

## 輸出

- `app/assets/redive_tw.db` — SQLite 資料庫
- `app/assets/redive_tw.db.br` — Brotli 壓縮版本
- `tools/tw-redive-db-fetcher/version.json` — 版本追蹤檔（自動產生，已 gitignore）

## 運作原理

1. **版本猜測** — 以遞減 delta（1M → 100K → ... → 1）探測 CDN manifest 端點，找到最新的 TruthVersion
2. **Manifest 解析** — 從 manifest 取得 masterdata bundle 的 hash 和大小
3. **Bundle 下載** — 從 CDN pool 下載 Unity AssetBundle
4. **DB 提取** — 用 UnityPy 解壓 AssetBundle，從 TextAsset 中提取 SQLite 資料庫
5. **反混淆** — 資料表和欄位名稱是 `v1_<hash>` 格式，透過資料特徵比對自動辨識並建立 SQL VIEW（`unit_profile`、`unit_data`、`unit_rarity`）

## 依賴

- `requests` — HTTP 請求
- `UnityPy` — Unity AssetBundle 解壓
- `brotli` — DB 壓縮
