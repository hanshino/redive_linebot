import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useAxios from "axios-hooks";
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Paper,
  Skeleton,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
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
import {
  NUMS,
  ORDER_COPY,
  calcFee,
  calcNet,
  displayName,
  errorText,
  fmtStone,
  normalizeOrderType,
  posterNameOf,
} from "./_market";
import { CharAvatar, BaseStar, GradientPanel, OrderTypeSwitch, Row, Tag } from "./_marketUi";

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
function CharacterChip({ char, selected, onClick, buy }) {
  const accent = buy ? "secondary" : "primary";
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
            ? theme.palette[accent].light
            : theme.palette[accent].dark
          : theme.palette.text.primary,
        border: "1px solid",
        borderColor: selected ? `${accent}.main` : "divider",
        bgcolor: selected
          ? alpha(theme.palette[accent].main, 0.14)
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
/**
 * 一列同時服務兩本簿子。差別只有三處，其餘版面刻意保持一致：
 *   1. 副標的角色（賣家 / 收購方）
 *   2. 價格底下多一行「你實收」——收購單看的是拿到手的數字
 *   3. 主按鈕（立即購買 / 賣給他）與它被擋下來的理由
 */
function OrderCard({ listing, orderType, best, onAct, blockReason }) {
  const buy = orderType === "buy";
  const copy = ORDER_COPY[orderType];
  const mine = Boolean(listing.mine);
  const navigate = useNavigate();
  const accent = buy ? "secondary" : "primary";

  const disabledLabel = mine
    ? buy
      ? "這是你自己發的收購單，無法賣給自己"
      : "這是你自己的掛單，無法購買"
    : blockReason === "NOT_OWNED"
      ? `你沒有${listing.name}，無法賣出`
      : null;
  const disabled = Boolean(disabledLabel);

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
            : alpha(theme.palette[accent].main, 0.4),
        },
      })}
    >
      <CharAvatar itemId={listing.itemId} name={listing.name} headImage={listing.headImage} />
      <Box
        onClick={() =>
          navigate(`/trade/listings/${listing.id}`, { state: { fromMarket: true, orderType } })
        }
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
          {best && !mine && <Tag label={copy.best} color="success" />}
          {mine && <Tag label={buy ? "你的收購單" : "你的掛單"} color="secondary" />}
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{ display: "block", mt: "3px" }}
        >
          {copy.poster} {displayName(posterNameOf(listing))} ・ {listing.itemId}
        </Typography>
        <Box
          sx={theme => ({
            display: "flex",
            alignItems: "center",
            gap: 0.625,
            mt: 0.625,
            fontSize: 15,
            fontWeight: 600,
            color: theme.palette.mode === "dark" ? `${accent}.light` : `${accent}.dark`,
            ...NUMS,
          })}
        >
          <DiamondIcon sx={{ fontSize: 13 }} />
          {fmtStone(listing.price)}
          <Box component="span" sx={{ fontSize: 11, fontWeight: 400, color: "text.secondary" }}>
            女神石
          </Box>
        </Box>
        {buy && (
          <Typography sx={{ fontSize: 11.5, color: "text.secondary", mt: "2px", ...NUMS }}>
            你實收 {fmtStone(listing.netProceeds ?? calcNet(listing.price))}（扣 5% 手續費）
          </Typography>
        )}
      </Box>
      {disabled ? (
        // 依設計稿：不能操作時保留按鈕但停用。用 aria-disabled 而非 disabled，
        // 讀屏會唸出來；同時不掛 onClick，按下去真的不會發生任何事。
        <Button
          size="small"
          variant="outlined"
          component="span"
          role="button"
          tabIndex={0}
          aria-disabled="true"
          aria-label={disabledLabel}
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
          {copy.action}
        </Button>
      ) : (
        <Button
          size="small"
          variant="contained"
          color={accent}
          onClick={() => onAct(listing)}
          sx={{ flex: "0 0 auto" }}
        >
          {copy.action}
        </Button>
      )}
    </Paper>
  );
}

/* ---------------------------------------------------------------- 空狀態 */
function EmptyBook({ orderType, onBackToAll }) {
  const buy = orderType === "buy";
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
          borderColor: alpha(theme.palette[buy ? "secondary" : "primary"].main, 0.45),
          display: "grid",
          placeItems: "center",
          color: buy ? "secondary.main" : "primary.main",
          fontSize: 26,
        })}
      >
        ◌
      </Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mt: 0.5 }}>
        {buy ? "目前沒有人收購這個角色" : "該角色目前沒有掛單"}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
        {buy ? (
          <>
            等其他玩家發收購單，或改看別的角色。
            <br />
            你也可以自己掛一張賣單等人來買。
          </>
        ) : (
          <>
            等其他玩家上架，或改看別的角色。
            <br />
            你也可以自己掛一張。
          </>
        )}
      </Typography>
      <Button variant="outlined" onClick={onBackToAll} sx={{ mt: 0.75 }}>
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
  const [searchParams, setSearchParams] = useSearchParams();

  const [keyword, setKeyword] = useState("");
  // 一個 state 服務兩本簿子：all 是全部，filtered 的意思隨方向改變
  //（賣單＝我沒有的，收購單＝我持有的）。兩本的「另一半」在概念上是同一件事：
  // 只留下我真的能操作的角色。
  const [view, setView] = useState("all");
  const [pending, setPending] = useState(null);

  const [{ data: summary, loading: summaryLoading }, refetchSummary] = useAxios(
    "/api/public-market/summary",
    { manual: true }
  );
  const [{ loading: charsLoading }, fetchChars] = useAxios("/api/public-market/characters", {
    manual: true,
  });
  const [{ data: inventory, error: invError }, refetchInventory] = useAxios("/api/inventory", {
    manual: true,
  });
  const [{ loading: listingsLoading }, fetchListings] = useAxios("/api/public-market/listings", {
    manual: true,
  });
  const [{ loading: acting }, submitAction] = useAxios({ method: "POST" }, { manual: true });
  const [{ message, severity, open: snackOpen }, { handleOpen, handleClose }] = useHintBar();

  useEffect(() => {
    document.title = "角色交易所";
  }, []);

  /* ---- 網址是唯一的真相 ------------------------------------------------ */
  // 方向與選了誰都只存在 query 裡，不再另外開一份 state，免得兩邊互相覆寫。
  // 上一頁／下一頁、重新整理、分享連結因此自然可用。
  const rawOrderType = searchParams.get("orderType");
  const orderType = normalizeOrderType(rawOrderType);
  const buy = orderType === "buy";
  const copy = ORDER_COPY[orderType];
  const queryId = searchParams.get("characterId");

  // 網址被亂改成 ?orderType=xxx 時安靜正規化，不然分享出去的連結會一直帶著噪音。
  useEffect(() => {
    if (rawOrderType == null || rawOrderType === "buy" || rawOrderType === "sell") return;
    const next = {};
    if (queryId) next.characterId = queryId;
    setSearchParams(next, { replace: true });
  }, [rawOrderType, queryId, setSearchParams]);

  const buildParams = useCallback((type, characterId) => {
    const next = {};
    // sell 是預設值，不寫進網址，第一階段留下來的連結才不會突然多一段參數。
    if (type === "buy") next.orderType = "buy";
    if (characterId) next.characterId = String(characterId);
    return next;
  }, []);

  /* ---- 角色清單：跟著方向走 -------------------------------------------- */
  // 兩本簿子的角色清單完全不同，所以資料要記住「這份是誰的」，
  // 換方向的那一幀才不會拿舊清單去驗新網址（會把合法的 characterId 誤刪）。
  const [chars, setChars] = useState({ type: null, ok: false, rows: [] });
  const charSeq = useRef(0);

  const loadCharacters = useCallback(
    async type => {
      const seq = ++charSeq.current;
      try {
        const { data } = await fetchChars({ params: { orderType: type } });
        if (seq !== charSeq.current) return;
        setChars({ type, ok: true, rows: Array.isArray(data) ? data : [] });
      } catch {
        if (seq !== charSeq.current) return;
        setChars({ type, ok: false, rows: [] });
      }
    },
    [fetchChars]
  );

  useEffect(() => {
    if (!isLoggedIn) return;
    refetchSummary();
    refetchInventory().catch(() => {});
  }, [isLoggedIn, refetchSummary, refetchInventory]);

  useEffect(() => {
    if (!isLoggedIn) return;
    loadCharacters(orderType);
  }, [isLoggedIn, orderType, loadCharacters]);

  const charsCurrent = chars.type === orderType ? chars : null;
  const charList = useMemo(() => (charsCurrent?.ok ? charsCurrent.rows : []), [charsCurrent]);
  const charsLoaded = Boolean(charsCurrent?.ok);
  const charsError = Boolean(charsCurrent) && !charsCurrent.ok;

  const selected = useMemo(
    () => (queryId ? charList.find(c => String(c.itemId) === queryId) || null : null),
    [charList, queryId]
  );
  const selectedId = selected ? String(selected.itemId) : null;

  // 角色清單還沒回來就先不要退回選角畫面，不然重新整理／換方向會閃一下。
  // 清單真的抓失敗時要放行，否則畫面會卡在骨架上，連錯誤訊息都看不到。
  const resolvingQuery = Boolean(queryId) && !charsLoaded && !charsError;

  // query 指到這本簿子裡不存在的角色（換方向、角色被下架、網址被亂改），
  // 等這本的資料到齊再安靜清掉，方向本身保留。
  useEffect(() => {
    if (!charsLoaded || !queryId || selected) return;
    setSearchParams(buildParams(orderType, null), { replace: true });
  }, [charsLoaded, queryId, selected, orderType, buildParams, setSearchParams]);

  /* ---- 掛單本體 -------------------------------------------------------- */
  // book.key 綁住這份資料屬於「哪本簿子的哪位角色」，換角色或換方向的那一幀
  // 就不會閃到上一份的價格。
  const [book, setBook] = useState({ key: null, ok: false, rows: [] });
  const reqSeq = useRef(0);

  const loadListings = useCallback(
    async (itemId, type) => {
      const key = `${type}:${itemId}`;
      const seq = ++reqSeq.current;
      try {
        const { data } = await fetchListings({
          params: { itemId: String(itemId), orderType: type },
        });
        // 慢回來的舊請求直接丟掉，不能蓋掉新資料。
        if (seq !== reqSeq.current) return;
        setBook({ key, ok: true, rows: Array.isArray(data) ? data : [] });
      } catch {
        if (seq !== reqSeq.current) return;
        setBook({ key, ok: false, rows: [] });
      }
    },
    [fetchListings]
  );

  // 只跟著 selectedId + orderType 走。charList 重抓會換新物件，但這裡比對的是字串。
  // （react-hooks/set-state-in-effect 會警告這裡：抓資料本來就得寫回 state，
  //   跟 repo 內其他 fetch-on-mount effect 同一類，eslint 設定刻意留成 warn。）
  useEffect(() => {
    if (!isLoggedIn || !selectedId) return;
    loadListings(selectedId, orderType);
  }, [isLoggedIn, selectedId, orderType, loadListings]);

  // 背包裡的 itemId 999 是女神石本身，不是角色。
  const ownedIds = useMemo(
    () =>
      new Set(
        (Array.isArray(inventory) ? inventory : [])
          .filter(i => i.itemId !== 999)
          .map(i => String(i.itemId))
      ),
    [inventory]
  );
  // 背包沒載完就不能判斷持有與否，否則會把全部角色都說成未持有。
  const ownedKnown = Array.isArray(inventory) && !invError;

  const matchesView = useCallback(
    c => (buy ? ownedIds.has(String(c.itemId)) : !ownedIds.has(String(c.itemId))),
    [buy, ownedIds]
  );
  const filteredCount = useMemo(
    () => (ownedKnown ? charList.filter(matchesView).length : null),
    [ownedKnown, charList, matchesView]
  );
  const filterActive = view === "filtered" && ownedKnown;

  // 畫面永遠只看「這份資料是不是這本簿子這位角色的」。
  const bookKey = selectedId ? `${orderType}:${selectedId}` : null;
  const current = bookKey && book.key === bookKey ? book : null;
  const rows = current?.ok ? current.rows : [];
  const rowsPending = Boolean(selectedId) && (!current || listingsLoading);
  const rowsFailed = Boolean(current) && !current.ok && !listingsLoading;
  const showSkeleton = Boolean(selectedId) && !current;

  // 收購單只有持有該角色的人能履約。背包讀不到就先不擋，交給後端把關，
  // 免得把真的持有的人也一起關在門外。
  const ownsSelected = selectedId ? ownedIds.has(selectedId) : false;
  const blockReason = buy && ownedKnown && !ownsSelected ? "NOT_OWNED" : null;

  const filtered = useMemo(() => {
    const base = filterActive ? charList.filter(matchesView) : charList;
    const q = keyword.trim().toLowerCase();
    if (!q) return base;
    return base.filter(c => c.name?.toLowerCase().includes(q) || String(c.itemId).includes(q));
  }, [charList, keyword, filterActive, matchesView]);

  const handleSelect = itemId => {
    // push 一筆，讓詳情頁返回時回到同一本簿子的同一位角色。
    setSearchParams(buildParams(orderType, itemId));
  };

  const handleBackToAll = () => setSearchParams(buildParams(orderType, null));

  const handleSwitchBook = next => {
    if (next === orderType) return;
    // 帶著 characterId 一起換：多數時候同一位角色兩本都有，換過去還能接著看。
    // 真的沒有時，上面那個「清掉不存在的 characterId」的 effect 會在新清單到齊後收尾，
    // 所以這裡不需要先猜。搜尋字保留，視角回到「全部」——filtered 在兩本的語意相反，
    // 沿用會讓人以為看到的是同一批角色。
    setView("all");
    setSearchParams(buildParams(next, queryId));
  };

  const handleConfirmAction = async () => {
    if (!pending) return;
    const isBuyBook = orderType === "buy";
    try {
      const { data } = await submitAction({
        url: isBuyBook
          ? `/api/public-market/listings/${pending.id}/fulfill`
          : `/api/public-market/listings/${pending.id}/purchase`,
      });
      setPending(null);
      handleOpen(
        isBuyBook
          ? `已賣出 ${data.name ?? pending.name}，實收 ${fmtStone(data.netProceeds ?? calcNet(pending.price))} 女神石`
          : `已購買 ${data.name ?? pending.name}，花費 ${fmtStone(data.price ?? pending.price)} 女神石`,
        "success"
      );
      refetchSummary();
      loadCharacters(orderType);
      refetchInventory().catch(() => {});
      if (selectedId) loadListings(selectedId, orderType);
    } catch (err) {
      setPending(null);
      handleOpen(
        errorText(err, isBuyBook ? "賣出失敗，請稍後再試" : "購買失敗，請稍後再試"),
        "error"
      );
      refetchSummary();
      refetchInventory().catch(() => {});
      if (selectedId) loadListings(selectedId, orderType);
    }
  };

  if (!isLoggedIn) return <AlertLogin />;

  const hasMine = rows.some(r => r.mine);
  const balance = summary?.balance;
  // 切到會用到背包的視角但背包還沒回來：先擋住清單，不能亂猜持有狀態。
  const waitingInventory = view === "filtered" && !ownedKnown && !invError;
  const showPicker = !selected && !resolvingQuery;

  const filteredLabel = buy ? "我持有的" : "我沒有的";
  const pendingNet = pending ? (pending.netProceeds ?? calcNet(pending.price)) : 0;
  const pendingFee = pending ? (pending.fee ?? calcFee(pending.price)) : 0;

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

      <OrderTypeSwitch value={orderType} onChange={handleSwitchBook} />

      <GradientPanel tone={orderType}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.75 }}>
          {buy ? "公開收購簿" : "公開掛單簿"}
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2, fontSize: 12, lineHeight: 1.7, opacity: 0.92 }}>
          {buy ? (
            <>
              <li>這裡是別人想買的角色，你有的話可以直接賣給他</li>
              <li>成交時抽取 5% 手續費，你拿到的是扣完手續費的金額</li>
              <li>收購方發單時就已預扣全額，成交當下不會反悔</li>
            </>
          ) : (
            <>
              <li>成交時抽取 5% 手續費，該部分女神石直接銷毀</li>
              <li>每位玩家同一角色只能持有一張，已擁有的角色無法購買</li>
            </>
          )}
        </Box>
      </GradientPanel>

      {charsError && (
        <Alert
          severity="error"
          sx={{ borderRadius: 3 }}
          action={
            <Button color="inherit" size="small" onClick={() => loadCharacters(orderType)}>
              重試
            </Button>
          }
        >
          載入{buy ? "收購簿" : "掛單簿"}失敗，請稍後再試
        </Alert>
      )}

      {selected || resolvingQuery ? (
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
          {selected ? (
            <>
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
                  {selected.itemId} ・{" "}
                  {rowsPending
                    ? `讀取${copy.noun}中…`
                    : rowsFailed
                      ? `${copy.noun}讀取失敗`
                      : `目前 ${rows.length} 張${copy.noun}`}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="outlined"
                startIcon={<SwapHorizIcon />}
                onClick={handleBackToAll}
                sx={{ flex: "0 0 auto" }}
              >
                所有角色
              </Button>
            </>
          ) : (
            <>
              <Skeleton variant="circular" width={44} height={44} animation="wave" />
              <Box sx={{ flex: "1 1 auto" }}>
                <Skeleton variant="text" width={120} animation="wave" />
                <Skeleton variant="text" width={90} animation="wave" />
              </Box>
            </>
          )}
        </Paper>
      ) : null}

      {showPicker && (
        <>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
              flexWrap: "wrap",
            }}
          >
            <Typography
              variant="caption"
              sx={{ fontWeight: 600, letterSpacing: ".06em", color: "text.secondary" }}
            >
              選擇角色
            </Typography>
            <ToggleButtonGroup
              value={view}
              exclusive
              size="small"
              onChange={(_, v) => v !== null && setView(v)}
              aria-label="角色清單視角"
              sx={{
                "& .MuiToggleButton-root": {
                  px: 1.5,
                  py: 0.375,
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: "999px !important",
                  textTransform: "none",
                },
              }}
            >
              <ToggleButton
                value="all"
                aria-label={buy ? "顯示全部有人收購的角色" : "顯示全部有掛單的角色"}
              >
                全部角色{charsLoaded ? ` (${charList.length})` : ""}
              </ToggleButton>
              <ToggleButton
                value="filtered"
                disabled={Boolean(invError)}
                aria-label={buy ? "只顯示我持有、可以賣出的角色" : "只顯示我還沒有的角色"}
              >
                {filteredLabel}
                {filteredCount === null ? "" : ` (${filteredCount})`}
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {invError && (
            <Alert severity="warning" sx={{ borderRadius: 3 }}>
              讀不到你的角色清單，先顯示全部角色。
            </Alert>
          )}

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
          {(charsLoading && charList.length === 0) || waitingInventory ? (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }} aria-busy="true">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <Skeleton key={i} variant="rounded" width={104} height={36} animation="wave" />
              ))}
            </Box>
          ) : (
            <Box
              role="group"
              aria-label={filterActive ? `${filteredLabel}的角色列表` : "角色列表"}
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
                  buy={buy}
                  selected={String(c.itemId) === selectedId}
                  onClick={() => handleSelect(c.itemId)}
                />
              ))}
            </Box>
          )}
          {waitingInventory && (
            <Typography variant="body2" color="text.secondary" sx={{ px: 0.25 }} role="status">
              正在確認你已經擁有哪些角色…
            </Typography>
          )}
          {!charsLoading && !waitingInventory && filtered.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ px: 0.25, py: 0.75 }}>
              {filterActive
                ? keyword.trim()
                  ? `${filteredLabel}角色裡找不到符合的。`
                  : buy
                    ? "目前有人收購的角色，你都還沒有。"
                    : "目前有掛單的角色你都已經擁有了。"
                : charsLoaded && charList.length === 0
                  ? buy
                    ? "目前沒有任何收購單。"
                    : "目前沒有任何掛單。"
                  : "找不到符合的角色。"}
            </Typography>
          )}
        </>
      )}

      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        <Typography
          variant="caption"
          sx={{ fontWeight: 600, letterSpacing: ".06em", color: "text.secondary" }}
        >
          {selected ? `${selected.name} 的${copy.noun}` : copy.noun}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {!selected
            ? copy.sortNote
            : rowsPending
              ? "載入中…"
              : rowsFailed
                ? "讀取失敗"
                : rows.length
                  ? `${rows.length} 張 ・ ${copy.sortNote}`
                  : "0 張"}
        </Typography>
      </Box>

      {rowsFailed && (
        <Alert
          severity="error"
          sx={{ borderRadius: 3 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => loadListings(selectedId, orderType)}
            >
              重試
            </Button>
          }
        >
          載入{copy.noun}失敗，請稍後再試
        </Alert>
      )}

      {!selected && !resolvingQuery && (
        <Note>
          先從上面挑一個角色，就會看到目前的{copy.noun}。
          {buy && "收購單是別人出價想買，你有那隻角色就能直接賣。"}
        </Note>
      )}

      {showSkeleton || resolvingQuery ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }} aria-busy="true">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} variant="rounded" height={88} animation="wave" />
          ))}
        </Box>
      ) : selected && rowsFailed ? null : selected && rows.length === 0 ? (
        <EmptyBook orderType={orderType} onBackToAll={handleBackToAll} />
      ) : (
        selected &&
        rows.length > 0 && (
          <>
            {buy && ownedKnown && !ownsSelected && (
              <Alert severity="info" sx={{ borderRadius: 3 }}>
                你目前沒有 {selected.name}，只能看價格，沒辦法賣出。
              </Alert>
            )}
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
                <OrderCard
                  key={listing.id}
                  listing={listing}
                  orderType={orderType}
                  best={i === 0}
                  blockReason={blockReason}
                  onAct={setPending}
                />
              ))}
            </Box>
          </>
        )
      )}

      {selected && !rowsPending && !rowsFailed && rows.length === 0 && (
        <Note>
          {buy
            ? "收購簿只顯示還沒成交的收購單，成交或撤單後會立刻從這裡消失。"
            : "掛單簿只顯示目前還沒成交的賣單，成交或撤單後會立刻從這裡消失。"}
        </Note>
      )}
      {hasMine && (
        <Note>
          你自己的{copy.noun}會一起顯示，方便對照別人的價格。要撤單請到
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

      {selected && (
        <Button variant="text" onClick={handleBackToAll} startIcon={<SwapHorizIcon />}>
          回到所有角色
        </Button>
      )}

      <Box sx={{ display: "flex", gap: 1.25, flexWrap: "wrap" }}>
        <Button variant="outlined" onClick={() => navigate("/trade/sell")} sx={{ flex: "1 1 45%" }}>
          我要掛賣單
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          onClick={() => navigate("/trade/buy")}
          sx={{ flex: "1 1 45%" }}
        >
          我要發收購單
        </Button>
      </Box>

      <Dialog
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        fullWidth
        maxWidth="xs"
        aria-labelledby="market-action-title"
      >
        <DialogTitle id="market-action-title" sx={{ fontWeight: 600 }}>
          {buy ? "確認賣出" : "確認購買"}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
            {buy
              ? "賣出後角色立刻離開你的box，升星強化不會轉移也不會退錢，此操作無法取消。"
              : "購買後角色直接進入你的box，此操作無法取消。"}
          </Typography>
          {pending && (
            <Box sx={{ mt: 1.5 }}>
              <Row label="角色" value={`${pending.name}（${pending.itemId}）`} />
              {Number(pending.star) >= 1 && (
                <Row
                  label={buy ? "對方會取得" : "你會取得"}
                  value={`基礎 ${Number(pending.star)} 星`}
                />
              )}
              <Row label={copy.poster} value={displayName(posterNameOf(pending))} />
              <Row label={buy ? "收購價" : "售價"} value={`${fmtStone(pending.price)} 女神石`} />
              <Row label="手續費（5%，銷毀）" value={`${fmtStone(pendingFee)} 女神石`} />
              {buy ? (
                <>
                  <Row
                    label="你實收"
                    value={`${fmtStone(pendingNet)} 女神石`}
                    valueColor="secondary.main"
                  />
                  <Row
                    label="你的餘額"
                    value={`${fmtStone(balance)} → ${fmtStone((balance ?? 0) + pendingNet)} 女神石`}
                  />
                </>
              ) : (
                <Row
                  label="你的餘額"
                  value={`${fmtStone(balance)} → ${fmtStone((balance ?? 0) - pending.price)} 女神石`}
                />
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setPending(null)} disabled={acting}>
            取消
          </Button>
          <Button
            variant="contained"
            color={buy ? "secondary" : "primary"}
            onClick={handleConfirmAction}
            disabled={acting}
            autoFocus
          >
            {buy ? "確認賣出" : "確認購買"}
          </Button>
        </DialogActions>
      </Dialog>

      <HintSnackBar open={snackOpen} message={message} severity={severity} onClose={handleClose} />
    </Box>
  );
}
