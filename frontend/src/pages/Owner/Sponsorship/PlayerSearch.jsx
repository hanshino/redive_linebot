import { useState, useEffect, useRef } from "react";
import {
  Autocomplete,
  TextField,
  Avatar,
  Box,
  Typography,
  CircularProgress,
  Stack,
} from "@mui/material";
import * as svc from "../../../services/sponsorship";

// 頭像直接用 players 搜尋回傳的 pictureUrl；後端還沒補上或為 null 時就顯示名字首字，
// 不另外對 /api/profile 發請求。
export function PlayerAvatar({ pictureUrl, displayName, size = 36 }) {
  return (
    <Avatar
      src={pictureUrl || undefined}
      alt=""
      sx={{ width: size, height: size, fontSize: size * 0.45, bgcolor: "secondary.main" }}
    >
      {(displayName || "?").slice(0, 1)}
    </Avatar>
  );
}

export function PlayerRow({ player, dense = false }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0, width: "100%" }}>
      <PlayerAvatar
        pictureUrl={player.pictureUrl}
        displayName={player.displayName}
        size={dense ? 32 : 40}
      />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {player.displayName || "（未設定名稱）"}
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
            #{player.id}
          </Typography>
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontFamily: "monospace", display: "block", wordBreak: "break-all" }}
        >
          {player.userId}
        </Typography>
      </Box>
    </Stack>
  );
}

/**
 * 既有 LINE 玩家搜尋。只能從結果中選取，不能自由輸入建立玩家。
 * 選項顯示頭像 + 名字 + user.id + LINE userId，避免同名誤選。
 */
export default function PlayerSearch({
  value = null,
  onSelect,
  label = "搜尋玩家",
  placeholder = "名稱或 LINE userId",
  disabled = false,
  error = false,
  helperText,
}) {
  const [input, setInput] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    const q = input.trim();
    if (!q) {
      setOptions([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    let alive = true;
    timer.current = setTimeout(async () => {
      try {
        const items = await svc.fetchPlayers(q);
        if (alive) setOptions(items);
      } catch {
        if (alive) setOptions([]);
      } finally {
        if (alive) setLoading(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
  }, [input]);

  return (
    <Autocomplete
      value={value}
      options={options}
      loading={loading}
      disabled={disabled}
      filterOptions={x => x}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      getOptionLabel={p => (p ? `${p.displayName || "（未設定名稱）"} #${p.id}` : "")}
      onInputChange={(e, v, reason) => {
        if (reason !== "reset") setInput(v);
      }}
      onChange={(e, p) => onSelect?.(p)}
      noOptionsText={input.trim() ? "找不到符合的玩家" : "輸入名稱或 LINE userId 開始搜尋"}
      loadingText="搜尋中…"
      renderOption={(props, p) => {
        const { key, ...rest } = props;
        return (
          <li key={key} {...rest}>
            <PlayerRow player={p} dense />
          </li>
        );
      }}
      renderInput={params => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          error={error}
          helperText={helperText}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              endAdornment: (
                <>
                  {loading ? <CircularProgress size={18} /> : null}
                  {params.slotProps.input.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}
