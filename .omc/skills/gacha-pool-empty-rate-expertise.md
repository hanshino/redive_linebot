# Gacha Pool Empty Rate: NaN Poisoning Chain

## The Insight

In this codebase, a single GachaPool item with an empty `rate` string silently breaks **all** gacha draws. `parseFloat("") = NaN`, which poisons `getTotalRate`'s `.reduce()` chain (no initial value), making `max = NaN`. With `max = NaN`, `genRandom` returns all NaN values, and `play()` catches zero rewards. This propagates to an empty `strReport.join(" ")` in the flex message footer — which LINE API rejects with `/footer/contents/1/text: must be non-empty text`.

The symptom looks like a template bug but the root cause is data corruption in the DB.

## Why This Matters

The error `LINE API: /footer/contents/1/text: must be non-empty text` points at the template, but the actual cause is upstream in `getTotalRate` → `play()`. Debugging the template is a dead end; you must check `getTotalRate` returning NaN and then trace which pool item has an invalid rate.

## Recognition Pattern

- `#抽` command fails for ALL users simultaneously
- LINE API error: `/footer/contents/1/text: must be non-empty text` or `/contents/1/footer/contents/1/text: must be non-empty text`
- `rareCount` is `{}` (no rewards drawn)

**Diagnosis command:**
```js
const pool = await GachaModel.getDatabasePool();
const badItems = pool.filter(d => isNaN(parseFloat((d.rate || '').replace('%', ''))));
console.log(badItems.map(d => ({id: d.id, name: d.name, rate: d.rate})));
```

## How Empty Rates Get Into the DB

`GachaPoolForm.jsx` used to load rates with `parseFloat(character.rate) || ""`. Since `0` is falsy, any character with `rate = "0%"` would show an empty form field. Saving without noticing would write `""` to the DB. The validation in `handleSave` also didn't check for empty rate.

## The Fix

Two layers:

1. **Defensive in `getTotalRate`** (`app/src/controller/princess/gacha.js`):
   ```js
   .map(data => parseFloat(data.rate.replace("%", "")) || 0)
   .reduce((pre, curr) => pre + curr, 0)
   ```
   Items with empty/invalid rates are treated as 0% (never drawn).

2. **Prevent recurrence in form** (`frontend/src/pages/Admin/GachaPool/GachaPoolForm.jsx`):
   - Load: `isNaN(parsedRate) ? "" : parsedRate` (not `parsedRate || ""`)
   - Save: validate `parseFloat(formData.rate)` is a valid number >= 0 before submitting
   - Backend: `validateRate(objParam.rate)` throws `GachaException` for NaN or negative values

## Affected Files

- `app/src/controller/princess/gacha.js` — `getTotalRate`, `validateRate`, `insertCharacter`, `updateCharacter`
- `frontend/src/pages/Admin/GachaPool/GachaPoolForm.jsx` — `fetchCharacter`, `handleSave`
