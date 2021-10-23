## 介紹

此目錄包含了 `opencv` 的模組，並且提供了一些簡單的使用方式。

## 使用情境

因為 `python` 具備較為完善的 `opencv` 模組，所以此專案提供了一些 `api` 供機器人核心做相關的圖像處理。

## API 列表

### 戰隊傷害回報圖像分析

將圖像轉換為 `opencv` 的 `numpy` 格式，並且分析出圖像中的戰隊傷害以及隊伍成員。

#### Request

```http
POST /api/v1/Guild/Battle/Info
```

| 參數    | 型態     | 說明          |
| :------ | :------- | :------------ |
| `image` | `string` | `base64` 圖片 |

### 競技場隊伍回報圖像分析

將圖像轉換為 `opencv` 的 `numpy` 格式，並且分析出圖像中的隊伍成員以及防守方的隊伍成員。

#### Request

```http
POST /api/v1/Arena/Battle/Result
```

| 參數    | 型態     | 說明          |
| :------ | :------- | :------------ |
| `image` | `string` | `base64` 圖片 |

### 競技場隊伍搜尋圖像分析

將圖像轉換為 `opencv` 的 `numpy` 格式，並且分析出圖像中的防守方的隊伍成員，以提供機器人核心進行隊伍搜尋。

#### Request

```http
POST /api/v1/Arena/Battle/Search
```

| 參數    | 型態     | 說明          |
| :------ | :------- | :------------ |
| `image` | `string` | `base64` 圖片 |

### 小遊戲世界王 - 傷害輸出圖表產生器

透過給定小遊戲的傷害輸出排行榜，將傷害輸出圖表產生出來。

#### Request

```http
POST /api/v1/World/Boss/DamageChart
```

| 參數                      | 型態     | 說明                             |
| :------------------------ | :------- | :------------------------------- |
| `top_data`                | `array`  | 傷害輸出排行榜(`max_length`: 10) |
| `top_data[]`              | `object` | 上榜成員資料                     |
| `top_data[].display_name` | `string` | 成員名稱                         |
| `top_data[].total_damage` | `number` | 傷害                             |
| `boss_hp`                 | `number` | 小遊戲世界王的血量               |
