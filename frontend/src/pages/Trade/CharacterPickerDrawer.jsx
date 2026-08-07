import { useEffect, useMemo, useState } from "react";
import {
  SwipeableDrawer,
  Box,
  Typography,
  Grid,
  Card,
  CardActionArea,
  Avatar,
  Button,
  IconButton,
  InputAdornment,
  TextField,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";

/**
 * Bottom-sheet character picker.
 * Props:
 *   open         - boolean
 *   onClose      - () => void
 *   items        - [{ itemId, name, headImage }]
 *   initialId    - itemId currently selected (may be null)
 *   onConfirm    - (itemId) => void
 *   title        - heading copy (defaults to the trade wording)
 */
export default function CharacterPickerDrawer({
  open,
  onClose,
  items,
  initialId,
  onConfirm,
  title = "選擇要交易的角色",
}) {
  const [localId, setLocalId] = useState(initialId ?? null);
  const [keyword, setKeyword] = useState("");

  // Re-syncing on each open keeps the picker honest if the parent's
  // selection changes between opens.
  useEffect(() => {
    if (open) setLocalId(initialId ?? null);
  }, [open, initialId]);

  const hits = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return items;
    return items.filter(i => i.name?.toLowerCase().includes(q) || String(i.itemId).includes(q));
  }, [items, keyword]);

  const handleConfirm = () => {
    onConfirm(localId);
    onClose();
  };

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      onOpen={() => {}}
      slotProps={{
        paper: {
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: "85dvh",
          },
        },
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: { md: 720 },
          mx: { md: "auto" },
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          pt: 2,
          pb: 1,
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography variant="caption" color="text.secondary">
            {hits.length} / {items.length} 位
          </Typography>
          <IconButton onClick={onClose} size="small" aria-label="關閉角色選擇">
            <CloseIcon />
          </IconButton>
        </Box>
      </Box>
      <Box
        sx={{
          width: "100%",
          maxWidth: { md: 720 },
          mx: { md: "auto" },
          px: 2,
          pb: 1.5,
        }}
      >
        <TextField
          type="search"
          size="small"
          fullWidth
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          placeholder="搜尋角色名稱或編號"
          aria-label="搜尋角色名稱或編號"
          autoComplete="off"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          width: "100%",
          maxWidth: { md: 720 },
          mx: { md: "auto" },
          px: 2,
          pb: 1,
        }}
      >
        {items.length === 0 ? (
          <Box sx={{ py: 6, textAlign: "center", color: "text.secondary" }}>
            您目前沒有可交易的角色
          </Box>
        ) : hits.length === 0 ? (
          <Box sx={{ py: 6, textAlign: "center", color: "text.secondary", fontSize: 13 }}>
            沒有符合「{keyword}」的角色。
            <br />
            可以搜名字或角色編號。
          </Box>
        ) : (
          <Grid container spacing={1.5}>
            {hits.map(item => {
              const selected = item.itemId === localId;
              return (
                <Grid size={{ xs: 4, sm: 3, md: 2 }} key={item.itemId}>
                  <Card
                    sx={{
                      outline: selected ? "3px solid" : "1px solid",
                      outlineColor: selected ? "primary.main" : "divider",
                      transition: "outline-color 150ms",
                    }}
                  >
                    <CardActionArea onClick={() => setLocalId(item.itemId)}>
                      <Box sx={{ position: "relative", pt: "100%" }}>
                        <Avatar
                          variant="rounded"
                          src={item.headImage}
                          alt={item.name}
                          sx={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            borderRadius: 0,
                          }}
                        />
                        {selected && (
                          <CheckCircleIcon
                            aria-hidden="true"
                            sx={{
                              position: "absolute",
                              right: 4,
                              top: 4,
                              fontSize: 20,
                              color: "primary.main",
                              bgcolor: "background.paper",
                              borderRadius: "50%",
                            }}
                          />
                        )}
                      </Box>
                      <Box sx={{ p: 0.75 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            display: "block",
                            textAlign: "center",
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {item.name}
                        </Typography>
                      </Box>
                    </CardActionArea>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}
      </Box>
      <Box
        sx={{
          borderTop: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box
          sx={{
            width: "100%",
            maxWidth: { md: 720 },
            mx: { md: "auto" },
            p: 2,
            paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
          }}
        >
          <Button fullWidth variant="contained" disabled={localId == null} onClick={handleConfirm}>
            確定
          </Button>
        </Box>
      </Box>
    </SwipeableDrawer>
  );
}
