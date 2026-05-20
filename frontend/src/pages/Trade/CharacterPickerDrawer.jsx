import { useState } from "react";
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
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

/**
 * Bottom-sheet character picker.
 * Props:
 *   open         - boolean
 *   onClose      - () => void
 *   items        - [{ itemId, name, headImage }]
 *   initialId    - itemId currently selected (may be null)
 *   onConfirm    - (itemId) => void
 */
export default function CharacterPickerDrawer({ open, onClose, items, initialId, onConfirm }) {
  const [localId, setLocalId] = useState(initialId ?? null);

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
      PaperProps={{
        sx: {
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          maxHeight: "85dvh",
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          pt: 2,
          pb: 1,
        }}
      >
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          選擇要交易的角色
        </Typography>
        <IconButton onClick={onClose} size="small" aria-label="關閉">
          <CloseIcon />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflowY: "auto", px: 2, pb: 1 }}>
        {items.length === 0 ? (
          <Box sx={{ py: 6, textAlign: "center", color: "text.secondary" }}>
            您目前沒有可交易的角色
          </Box>
        ) : (
          <Grid container spacing={1.5}>
            {items.map(item => {
              const selected = item.itemId === localId;
              return (
                <Grid size={{ xs: 4, sm: 3 }} key={item.itemId}>
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
          p: 2,
          borderTop: "1px solid",
          borderColor: "divider",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
        }}
      >
        <Button fullWidth variant="contained" disabled={localId == null} onClick={handleConfirm}>
          確定
        </Button>
      </Box>
    </SwipeableDrawer>
  );
}
