import { useEffect, useMemo, useState } from "react";
import useAxios from "axios-hooks";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Paper,
  Skeleton,
  TextField,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import SearchIcon from "@mui/icons-material/Search";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import DiamondIcon from "@mui/icons-material/Diamond";
import AlertLogin from "../../components/AlertLogin";
import HintSnackBar from "../../components/HintSnackBar";
import useHintBar from "../../hooks/useHintBar";
import useLiff from "../../context/useLiff";
import { NUMS, calcFee, displayName, errorText, fmtStone } from "./_market";
import { CharAvatar, BaseStar, GradientPanel, Row, Tag } from "./_marketUi";

/* ---------------------------------------------------------------- 錢包 chip */
function WalletChip({ balance, loading }) {
  return (
    <Box
      sx={theme => ({
        display: "inline-flex",
        alignItems: "center",
        gap: 0.75,
        px: 1.25,
        py: 0.625,
        borderRadius: 999,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: alpha(theme.palette.primary.main, 0.1),
        color: theme.palette.mode === "dark" ? "primary.light" : "primary.dark",
        fontSize: 13,
        fontWeight: 600,
        ...NUMS,
      })}
    >
      <DiamondIcon sx={{ fontSize: 14 }} />
      {loading ? "…" : fmtStone(balance)}
      <Box component="span" sx={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>
        女神石
      </Box>
    </Box>
  );
}

function PageHeader({ balance, loading }) {
  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 3,
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        py: 1,
        mb: -0.5,
        bgcolor: "background.default",
      }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: "1 1 auto" }}>
        角色交易所
      </Typography>
      <WalletChip balance={balance} loading={loading} />
    </Box>
  );
}

/* ---------------------------------------------------------------- 角色 chip */
function CharacterChip({ char, selected, onClick }) {
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      sx={theme => ({
        display: "inline-flex",
        alignItems: "center",
        gap: 0.875,
        pl: 0.625,
        pr: 1.5,
        py: 0.625,
        borderRadius: 999,
        cursor: "pointer",
        font: "inherit",
        fontSize: 13,
        fontWeight: 600,
        color: selected
          ? theme.palette.mode === "dark"
            ? theme.palette.primary.light
            : theme.palette.primary.dark
          : theme.palette.text.primary,
        border: "1px solid",
        borderColor: selected ? "primary.main" : "divider",
        bgcolor: selected
          ? alpha(theme.palette.primary.main, 0.14)
          : theme.palette.background.paper,
        transition: "transform .16s ease, box-shadow .16s ease, background .16s ease",
        "&:hover": { transform: "translateY(-1px)", boxShadow: theme.shadows[2] },
      })}
    >
      <CharAvatar
        itemId={char.itemId}
        name={char.name}
        headImage={char.headImage}
        size={24}
        sx={{ fontSize: 11 }}
      />
      <span>{char.name}</span>
      <BaseStar star={char.star} size={11} />
      <Box
        component="span"
        sx={theme => ({
          fontSize: 11,
          fontWeight: 600,
          color: "text.secondary",
          bgcolor: alpha(theme.palette.text.primary, 0.04),
          borderRadius: 999,
          px: 0.75,
          py: "1px",
        })}
      >
        {char.listingCount}
      </Box>
    </Box>
  );
}

/* ---------------------------------------------------------------- 掛單一列 */
function OrderCard({ listing, lowest, onBuy }) {
  const mine = Boolean(listing.mine);
  const navigate = useNavigate();
  return (
    <Paper
      component="li"
      elevation={0}
      sx={theme => ({
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        p: 1.5,
        borderRadius: 3,
        border: "1px solid",
        borderColor: mine ? alpha(theme.palette.secondary.main, 0.45) : "divider",
        transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: theme.shadows[4],
          borderColor: mine
            ? alpha(theme.palette.secondary.main, 0.6)
            : alpha(theme.palette.primary.main, 0.4),
        },
      })}
    >
      <CharAvatar itemId={listing.itemId} name={listing.name} headImage={listing.headImage} />
      <Box
        onClick={() => navigate(`/trade/listings/${listing.id}`)}
        sx={{ flex: "1 1 auto", minWidth: 0, cursor: "pointer" }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            flexWrap: "wrap",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {listing.name}
          <BaseStar star={listing.star} />
          {lowest && !mine && <Tag label="最低價" color="success" />}
          {mine && <Tag label="你的掛單" color="secondary" />}
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{ display: "block", mt: "3px" }}
        >
          賣家 {displayName(listing.sellerName)} ・ {listing.itemId}
        </Typography>
        <Box
          sx={theme => ({
            display: "flex",
            alignItems: "center",
            gap: 0.625,
            mt: 0.625,
            fontSize: 15,
            fontWeight: 600,
            color: theme.palette.mode === "dark" ? "primary.light" : "primary.dark",
            ...NUMS,
          })}
        >
          <DiamondIcon sx={{ fontSize: 13 }} />
          {fmtStone(listing.price)}
          <Box component="span" sx={{ fontSize: 11, fontWeight: 400, color: "text.secondary" }}>
            女神石
          </Box>
        </Box>
      </Box>
      {mine ? (
        // 依設計稿：自己的掛單保留按鈕但停用。用 aria-disabled 而非 disabled，
        // 讀屏會唸出來；同時不掛 onClick，按下去真的不會發生任何事。
        <Button
          size="small"
          variant="outlined"
          component="span"
          role="button"
          tabIndex={0}
          aria-disabled="true"
          aria-label="這是你自己的掛單，無法購買"
          sx={{
            flex: "0 0 auto",
            color: "text.secondary",
            borderColor: "divider",
            bgcolor: theme => alpha(theme.palette.text.primary, 0.04),
            cursor: "not-allowed",
            "&:hover": {
              borderColor: "divider",
              bgcolor: theme => alpha(theme.palette.text.primary, 0.04),
            },
          }}
        >
          立即購買
        </Button>
      ) : (
        <Button
          size="small"
          variant="contained"
          onClick={() => onBuy(listing)}
          sx={{ flex: "0 0 auto" }}
        >
          立即購買
        </Button>
      )}
    </Paper>
  );
}

/* ---------------------------------------------------------------- 空狀態 */
function EmptyBook({ onPickOther }) {
  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        textAlign: "center",
        py: 5,
        px: 2.5,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1.25,
      }}
    >
      <Box
        aria-hidden="true"
        sx={theme => ({
          width: 72,
          height: 72,
          borderRadius: "50%",
          border: "2px dashed",
          borderColor: alpha(theme.palette.primary.main, 0.45),
          display: "grid",
          placeItems: "center",
          color: "primary.main",
          fontSize: 26,
        })}
      >
        ◌
      </Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 0.5 }}>
        該角色目前沒有掛單
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
        等其他玩家上架，或改看別的角色。
        <br />
        你也可以自己掛一張。
      </Typography>
      <Button variant="outlined" onClick={onPickOther} sx={{ mt: 0.75 }}>
        看其他角色
      </Button>
    </Paper>
  );
}

function Note({ children }) {
  return (
    <Paper
      elevation={0}
      sx={theme => ({
        p: 1.5,
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: alpha(theme.palette.text.primary, 0.04),
        fontSize: 12,
        lineHeight: 1.7,
        color: "text.secondary",
      })}
    >
      {children}
    </Paper>
  );
}

/* ---------------------------------------------------------------- 主頁面 */
export default function Market() {
  const { loggedIn: isLoggedIn } = useLiff();
  const navigate = useNavigate();

  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(true);
  const [pending, setPending] = useState(null);

  const [{ data: summary, loading: summaryLoading }, refetchSummary] = useAxios(
    "/api/public-market/summary",
    { manual: true }
  );
  const [{ data: characters, loading: charsLoading, error: charsError }, refetchChars] = useAxios(
    "/api/public-market/characters",
    { manual: true }
  );
  const [{ data: listings, loading: listingsLoading, error: listingsError }, fetchListings] =
    useAxios("/api/public-market/listings", { manual: true });
  const [{ loading: buying }, purchase] = useAxios({ method: "POST" }, { manual: true });
  const [{ message, severity, open: snackOpen }, { handleOpen, handleClose }] = useHintBar();

  useEffect(() => {
    document.title = "角色交易所";
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    refetchSummary();
    refetchChars();
  }, [isLoggedIn, refetchSummary, refetchChars]);

  const charList = useMemo(() => (Array.isArray(characters) ? characters : []), [characters]);
  const rows = useMemo(() => (Array.isArray(listings) ? listings : []), [listings]);

  const selected = useMemo(
    () => charList.find(c => String(c.itemId) === String(selectedId)) || null,
    [charList, selectedId]
  );

  const filtered = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return charList;
    return charList.filter(c => c.name?.toLowerCase().includes(q) || String(c.itemId).includes(q));
  }, [charList, keyword]);

  const loadListings = itemId => fetchListings({ params: { itemId } }).catch(() => {});

  const handleSelect = itemId => {
    setSelectedId(itemId);
    setPickerOpen(false);
    loadListings(itemId);
  };

  const handleConfirmBuy = async () => {
    if (!pending) return;
    try {
      const { data } = await purchase({
        url: `/api/public-market/listings/${pending.id}/purchase`,
      });
      setPending(null);
      handleOpen(`已購買 ${data.name}，花費 ${fmtStone(data.price)} 女神石`, "success");
      refetchSummary();
      refetchChars();
      if (selectedId != null) loadListings(selectedId);
    } catch (err) {
      setPending(null);
      handleOpen(errorText(err, "購買失敗，請稍後再試"), "error");
      refetchSummary();
      if (selectedId != null) loadListings(selectedId);
    }
  };

  if (!isLoggedIn) return <AlertLogin />;

  const hasMine = rows.some(r => r.mine);
  const balance = summary?.balance;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1.75,
        pb: "calc(env(safe-area-inset-bottom) + 32px)",
      }}
    >
      <PageHeader balance={balance} loading={summaryLoading} />

      <GradientPanel>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.75 }}>
          公開掛單簿
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2, fontSize: 12, lineHeight: 1.7, opacity: 0.92 }}>
          <li>成交時抽取 5% 手續費，該部分女神石直接銷毀</li>
          <li>每位玩家同一角色只能持有一張，已擁有的角色無法購買</li>
        </Box>
      </GradientPanel>

      {charsError && (
        <Alert severity="error" sx={{ borderRadius: 3 }}>
          載入掛單簿失敗，請稍後再試
        </Alert>
      )}

      {selected && !pickerOpen ? (
        <Paper
          elevation={0}
          sx={{
            p: 1.5,
            borderRadius: 3,
            border: "1px solid",
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <CharAvatar
            itemId={selected.itemId}
            name={selected.name}
            headImage={selected.headImage}
          />
          <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 600 }} noWrap>
                {selected.name}
              </Typography>
              <BaseStar star={selected.star} />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ ...NUMS }}>
              {selected.itemId} ・ 目前 {rows.length} 張掛單
            </Typography>
          </Box>
          <IconButton aria-label="更換角色" onClick={() => setPickerOpen(true)}>
            <SwapHorizIcon />
          </IconButton>
        </Paper>
      ) : (
        <>
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, letterSpacing: ".06em", color: "text.secondary" }}
          >
            選擇角色
          </Typography>
          <TextField
            type="search"
            size="small"
            fullWidth
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="搜尋角色名稱或編號，例如 宮子 / 100701"
            aria-label="搜尋角色名稱或編號"
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
          {charsLoading && charList.length === 0 ? (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Skeleton key={i} variant="rounded" width={104} height={36} animation="wave" />
              ))}
            </Box>
          ) : (
            <Box
              role="group"
              aria-label="角色列表"
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: 1,
                maxHeight: 168,
                overflowY: "auto",
                p: 0.25,
              }}
            >
              {filtered.map(c => (
                <CharacterChip
                  key={c.itemId}
                  char={c}
                  selected={String(c.itemId) === String(selectedId)}
                  onClick={() => handleSelect(c.itemId)}
                />
              ))}
            </Box>
          )}
          {!charsLoading && filtered.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ px: 0.25, py: 0.75 }}>
              找不到符合的角色。
            </Typography>
          )}
        </>
      )}

      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        <Typography
          variant="caption"
          sx={{ fontWeight: 600, letterSpacing: ".06em", color: "text.secondary" }}
        >
          {selected ? `${selected.name} 的掛單` : "掛單"}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {selected ? (rows.length ? `${rows.length} 張 ・ 價格由低到高` : "0 張") : "價格由低到高"}
        </Typography>
      </Box>

      {listingsError && (
        <Alert severity="error" sx={{ borderRadius: 3 }}>
          載入掛單失敗，請稍後再試
        </Alert>
      )}

      {!selected && !listingsLoading && <Note>先從上面挑一個角色，就會看到目前的掛單。</Note>}

      {listingsLoading ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
          {[1, 2, 3].map(i => (
            <Skeleton key={i} variant="rounded" height={88} animation="wave" />
          ))}
        </Box>
      ) : selected && rows.length === 0 ? (
        <EmptyBook onPickOther={() => setPickerOpen(true)} />
      ) : (
        rows.length > 0 && (
          <Box
            component="ul"
            sx={{
              listStyle: "none",
              m: 0,
              p: 0,
              display: "flex",
              flexDirection: "column",
              gap: 1.25,
            }}
          >
            {rows.map((listing, i) => (
              <OrderCard key={listing.id} listing={listing} lowest={i === 0} onBuy={setPending} />
            ))}
          </Box>
        )
      )}

      {selected && rows.length === 0 && (
        <Note>掛單簿只顯示目前還沒成交的賣單，成交或撤單後會立刻從這裡消失。</Note>
      )}
      {hasMine && (
        <Note>
          你自己的掛單會一起顯示，方便對照別人的價格。要撤單請到
          <Box
            component={RouterLink}
            to="/trade/my-listings"
            sx={{ color: "primary.main", fontWeight: 600 }}
          >
            「我的掛單」
          </Box>
          。
        </Note>
      )}

      <Button variant="outlined" onClick={() => navigate("/trade/sell")}>
        我要掛賣單
      </Button>

      <Dialog open={Boolean(pending)} onClose={() => setPending(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 600 }}>確認購買</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            購買後角色直接進入你的box，此操作無法取消。
          </Typography>
          {pending && (
            <Box sx={{ mt: 1.5 }}>
              <Row label="角色" value={`${pending.name}（${pending.itemId}）`} />
              {Number(pending.star) >= 1 && (
                <Row label="你會取得" value={`基礎 ${Number(pending.star)} 星`} />
              )}
              <Row label="賣家" value={displayName(pending.sellerName)} />
              <Row label="售價" value={`${fmtStone(pending.price)} 女神石`} />
              <Row
                label="手續費（5%，銷毀）"
                value={`${fmtStone(pending.fee ?? calcFee(pending.price))} 女神石`}
              />
              <Row
                label="你的餘額"
                value={`${fmtStone(balance)} → ${fmtStone((balance ?? 0) - pending.price)} 女神石`}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setPending(null)} disabled={buying}>
            取消
          </Button>
          <Button variant="contained" onClick={handleConfirmBuy} disabled={buying} autoFocus>
            確認購買
          </Button>
        </DialogActions>
      </Dialog>

      <HintSnackBar open={snackOpen} message={message} severity={severity} onClose={handleClose} />
    </Box>
  );
}
