# Admin Commands

整理了一些管理指令，以便更好的管理您的伺服器。
施工中。

## 注意事項

- 所有指令都是由 `!` 開頭，並且只有管理員才能使用。
- 請先確保您的會員編號有在 `admin` 這張 `table` 中

## 使用方法

直接透過 Line 對官方帳號進行指令的動作。

## 指令

### 兌換券

#### 新增

`!coupon add <兌換碼> --start|s=<開始時間> --end|e=<結束時間> --reward|r=<獎項>`

範例為新增一個兌換券

| 參數           | 說明           |
| :------------- | :------------- |
| `--start\|s=`  | 兌換券開始時間 |
| `--end\|e=`    | 兌換券結束時間 |
| `--reward\|r=` | 兌換券獎項     |

```
!coupon add PI314 --start 2022-03-14T00:00:00 --end 2022-03-15T00:00:00 --reward 3140
```
