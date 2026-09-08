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
  KIND_COPY,
  NUMS,
  ORDER_COPY,
  calcFee,
  calcNet,
  displayName,
  errorText,
  fmtStone,
  itemLabel,
  nativeStarOf,
  normalizeItemKind,
  normalizeOrderType,
  posterNameOf,
  quantityOf,
  totalOf,
} from "./_market";
import {
  CharAvatar,
  BaseStar,
  GradientPanel,
  ItemKindSwitch,
  OrderTypeSwitch,
  QuantityBadge,
  Row,
  Tag,
} from "./_marketUi";

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
function CharacterChip({ char, selected, onClick, buy, fragment }) {
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
        kind={fragment ? "fragment" : "character"}
        size={24}
        sx={{ fontSize: 11 }}
      />
      <span>
        {char.name}
        {fragment && (
          <Box component="span" sx={{ fontWeight: 500, color: "text.secondary" }}>
            碎片
          </Box>
        )}
      </span>
      {/* 碎片簿的清單 API 回的 star 就是那隻角色的原生星數（getOpenCharacters 一律叫 star），
          但在碎片情境下它的讀法不一樣，所以 kind 要傳下去換 aria-label。 */}
      <BaseStar star={char.star} size={11} kind={fragment ? "fragment" : "character"} />
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
 *
 * 碎片列多一層：主數字改成**總價**，每片單價縮到底下那行。
 * 理由是玩家做決定時比的是「這筆要付多少」，把 50（每片）放大反而會被當成整筆的價錢；
 * 但單價還是得寫出來，不然沒辦法跨不同片數的單比價。
 */
function OrderCard({ listing, orderType, best, onAct, blockReason }) {
  const buy = orderType === "buy";
  const copy = ORDER_COPY[orderType];
  const mine = Boolean(listing.mine);
  const navigate = useNavigate();
  const accent = buy ? "secondary" : "primary";

  const fragment = normalizeItemKind(listing.itemKind) === "fragment";
  const quantity = quantityOf(listing);
  const total = totalOf(listing);
  // 主數字：角色看單價（quantity 恆 1，兩者同值），碎片看總價。
  const headline = fragment ? total : listing.price;

  const disabledLabel = mine
    ? buy
      ? `這是你自己發的收購單，無法賣給自己`
      : "這是你自己的掛單，無法購買"
    : blockReason === "NOT_OWNED"
      ? fragment
        ? `你的${listing.name}碎片不足 ${quantity} 片，無法賣出`
        : `你沒有${listing.name}，無法賣出`
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
      <CharAvatar
        itemId={listing.itemId}
        name={listing.name}
        headImage={listing.headImage}
        kind={fragment ? "fragment" : "character"}
      />
      <Box
        onClick={() =>
          navigate(`/trade/listings/${listing.id}`, {
            state: { fromMarket: true, orderType, itemKind: fragment ? "fragment" : "character" },
          })
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
          {itemLabel(listing)}
          {/* 碎片單讀 baseStar、角色單讀 star —— 後端刻意分名，這裡照著分。 */}
          <BaseStar star={nativeStarOf(listing)} kind={fragment ? "fragment" : "character"} />
          {fragment && <QuantityBadge quantity={quantity} />}
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
          {fmtStone(headline)}
          <Box component="span" sx={{ fontSize: 11, fontWeight: 400, color: "text.secondary" }}>
            女神石{fragment ? "（總價）" : ""}
          </Box>
        </Box>
        {fragment && (
          <Typography sx={{ fontSize: 11.5, color: "text.secondary", mt: "2px", ...NUMS }}>
            每片 {fmtStone(listing.price)} × {fmtStone(quantity)} 片
          </Typography>
        )}
        {buy && (
          <Typography sx={{ fontSize: 11.5, color: "text.secondary", mt: "2px", ...NUMS }}>
            你實收 {fmtStone(listing.netProceeds ?? calcNet(total))}（扣 5% 手續費）
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
function EmptyBook({ orderType, fragment, onBackToAll }) {
  const buy = orderType === "buy";
  const thing = fragment ? "碎片" : "角色";
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
        {buy ? `目前沒有人收購這個${thing}` : `該${thing}目前沒有掛單`}
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
  // 碎片簿要用到「我有幾片」：收購單能不能履約看的是片數夠不夠，
  // 不是有沒有那隻角色。只在碎片簿抓，角色簿不需要多打一支 API。
  const [{ data: fragData, error: fragError }, refetchFragments] = useAxios(
    "/api/character-fragments",
    { manual: true }
  );
  const [{ loading: listingsLoading }, fetchListings] = useAxios("/api/public-market/listings", {
    manual: true,
  });
  const [{ loading: acting }, submitAction] = useAxios({ method: "POST" }, { manual: true });
  const [{ message, severity, open: snackOpen }, { handleOpen, handleClose }] = useHintBar();

  useEffect(() => {
    document.title = "角色交易所";
  }, []);

  /* ---- 網址是唯一的真相 ------------------------------------------------ */
  // 方向、種類與選了誰都只存在 query 裡，不再另外開一份 state，免得兩邊互相覆寫。
  // 上一頁／下一頁、重新整理、分享連結因此自然可用。
  const rawOrderType = searchParams.get("orderType");
  const orderType = normalizeOrderType(rawOrderType);
  const buy = orderType === "buy";
  const copy = ORDER_COPY[orderType];
  const rawItemKind = searchParams.get("itemKind");
  const itemKind = normalizeItemKind(rawItemKind);
  const fragment = itemKind === "fragment";
  const kindCopy = KIND_COPY[itemKind];
  const queryId = searchParams.get("characterId");

  // 網址被亂改成 ?orderType=xxx / ?itemKind=xxx 時安靜正規化，
  // 不然分享出去的連結會一直帶著噪音。
  useEffect(() => {
    const badOrder = rawOrderType != null && rawOrderType !== "buy" && rawOrderType !== "sell";
    const badKind =
      rawItemKind != null && rawItemKind !== "fragment" && rawItemKind !== "character";
    if (!badOrder && !badKind) return;
    const next = {};
    if (orderType === "buy") next.orderType = "buy";
    if (itemKind === "fragment") next.itemKind = "fragment";
    if (queryId) next.characterId = queryId;
    setSearchParams(next, { replace: true });
  }, [rawOrderType, rawItemKind, orderType, itemKind, queryId, setSearchParams]);

  const buildParams = useCallback((type, kind, characterId) => {
    const next = {};
    // sell / character 是預設值，不寫進網址，第一階段留下來的連結才不會突然多一段參數。
    if (type === "buy") next.orderType = "buy";
    if (kind === "fragment") next.itemKind = "fragment";
    if (characterId) next.characterId = String(characterId);
    return next;
  }, []);

  /* ---- 角色清單：跟著方向與種類走 -------------------------------------- */
  // 四本簿子（賣/收購 × 角色/碎片）的角色清單完全不同，所以資料要記住「這份是誰的」，
  // 換簿子的那一幀才不會拿舊清單去驗新網址（會把合法的 characterId 誤刪）。
  const [chars, setChars] = useState({ key: null, ok: false, rows: [] });
  const charSeq = useRef(0);

  const loadCharacters = useCallback(
    async (type, kind) => {
      const key = `${type}:${kind}`;
      const seq = ++charSeq.current;
      try {
        const { data } = await fetchChars({ params: { orderType: type, itemKind: kind } });
        if (seq !== charSeq.current) return;
        setChars({ key, ok: true, rows: Array.isArray(data) ? data : [] });
      } catch {
        if (seq !== charSeq.current) return;
        setChars({ key, ok: false, rows: [] });
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
    if (!isLoggedIn || !fragment) return;
    refetchFragments().catch(() => {});
  }, [isLoggedIn, fragment, refetchFragments]);

  useEffect(() => {
    if (!isLoggedIn) return;
    loadCharacters(orderType, itemKind);
  }, [isLoggedIn, orderType, itemKind, loadCharacters]);

  const charsKey = `${orderType}:${itemKind}`;
  const charsCurrent = chars.key === charsKey ? chars : null;
  const charList = useMemo(() => (charsCurrent?.ok ? charsCurrent.rows : []), [charsCurrent]);
  const charsLoaded = Boolean(charsCurrent?.ok);
  const charsError = Boolean(charsCurrent) && !charsCurrent.ok;

  const selected = useMemo(
    () => (queryId ? charList.find(c => String(c.itemId) === queryId) || null : null),
    [charList, queryId]
  );
  const selectedId = selected ? String(selected.itemId) : null;

  // 角色清單還沒回來就先不要退回選角畫面，不然重新整理／換簿子會閃一下。
  // 清單真的抓失敗時要放行，否則畫面會卡在骨架上，連錯誤訊息都看不到。
  const resolvingQuery = Boolean(queryId) && !charsLoaded && !charsError;

  // query 指到這本簿子裡不存在的角色（換簿子、角色被下架、網址被亂改），
  // 等這本的資料到齊再安靜清掉，方向與種類本身保留。
  useEffect(() => {
    if (!charsLoaded || !queryId || selected) return;
    setSearchParams(buildParams(orderType, itemKind, null), { replace: true });
  }, [charsLoaded, queryId, selected, orderType, itemKind, buildParams, setSearchParams]);

  /* ---- 掛單本體 -------------------------------------------------------- */
  // book.key 綁住這份資料屬於「哪本簿子的哪位角色」，換角色或換簿子的那一幀
  // 就不會閃到上一份的價格。
  const [book, setBook] = useState({ key: null, ok: false, rows: [] });
  const reqSeq = useRef(0);

  const loadListings = useCallback(
    async (itemId, type, kind) => {
      const key = `${type}:${kind}:${itemId}`;
      const seq = ++reqSeq.current;
      try {
        const { data } = await fetchListings({
          params: { itemId: String(itemId), orderType: type, itemKind: kind },
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

  // 只跟著 selectedId + orderType + itemKind 走。charList 重抓會換新物件，
  // 但這裡比對的是字串。
  // （react-hooks/set-state-in-effect 會警告這裡：抓資料本來就得寫回 state，
  //   跟 repo 內其他 fetch-on-mount effect 同一類，eslint 設定刻意留成 warn。）
  useEffect(() => {
    if (!isLoggedIn || !selectedId) return;
    loadListings(selectedId, orderType, itemKind);
  }, [isLoggedIn, selectedId, orderType, itemKind, loadListings]);

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

  // itemId -> 我手上的碎片數。碎片簿的收購單能不能履約全看這個。
  const fragBalances = useMemo(() => {
    const list = Array.isArray(fragData?.fragments) ? fragData.fragments : [];
    return new Map(list.map(f => [String(f.itemId), Number(f.amount) || 0]));
  }, [fragData]);
  const fragKnown = Boolean(fragData) && !fragError;

  /**
   * 「只看我能操作的」在四本簿子裡的意思各不相同，所以條件寫在一起對照：
   *   角色賣單 —— 我還沒有的（已持有無法購買）
   *   角色收購 —— 我持有的（要交出角色才能履約）
   *   碎片賣單 —— 我還缺這隻角色的（買碎片沒有持有限制，但缺角色的人才有動機湊）
   *   碎片收購 —— 我有碎片的（要交出碎片才能履約）
   */
  const matchesView = useCallback(
    c => {
      const id = String(c.itemId);
      if (fragment) return buy ? (fragBalances.get(id) ?? 0) > 0 : !ownedIds.has(id);
      return buy ? ownedIds.has(id) : !ownedIds.has(id);
    },
    [fragment, buy, ownedIds, fragBalances]
  );

  // 這個視角需要的資料到齊了嗎：碎片收購簿看碎片，其餘看背包。
  const viewDataKnown = fragment && buy ? fragKnown : ownedKnown;

  const filteredCount = useMemo(
    () => (viewDataKnown ? charList.filter(matchesView).length : null),
    [viewDataKnown, charList, matchesView]
  );
  const filterActive = view === "filtered" && viewDataKnown;

  // 畫面永遠只看「這份資料是不是這本簿子這位角色的」。
  const bookKey = selectedId ? `${orderType}:${itemKind}:${selectedId}` : null;
  const current = bookKey && book.key === bookKey ? book : null;
  const rows = current?.ok ? current.rows : [];
  const rowsPending = Boolean(selectedId) && (!current || listingsLoading);
  const rowsFailed = Boolean(current) && !current.ok && !listingsLoading;
  const showSkeleton = Boolean(selectedId) && !current;

  // 收購單只有交得出資產的人能履約。資料讀不到就先不擋，交給後端把關，
  // 免得把真的有資產的人也一起關在門外。
  const ownsSelected = selectedId ? ownedIds.has(selectedId) : false;
  const selectedFrags = selectedId ? (fragBalances.get(selectedId) ?? 0) : 0;

  /**
   * 這張單擋不擋。
   *
   * 角色是「有沒有」，碎片是「夠不夠 quantity」——所以碎片必須逐單判斷，
   * 不能像角色那樣算一次就套用整本簿子（同一角色的碎片單片數各不相同）。
   */
  const blockReasonFor = useCallback(
    listing => {
      if (!buy) return null;
      if (fragment) {
        if (!fragKnown) return null;
        return selectedFrags >= quantityOf(listing) ? null : "NOT_OWNED";
      }
      if (!ownedKnown) return null;
      return ownsSelected ? null : "NOT_OWNED";
    },
    [buy, fragment, fragKnown, selectedFrags, ownedKnown, ownsSelected]
  );

  const filtered = useMemo(() => {
    const base = filterActive ? charList.filter(matchesView) : charList;
    const q = keyword.trim().toLowerCase();
    if (!q) return base;
    return base.filter(c => c.name?.toLowerCase().includes(q) || String(c.itemId).includes(q));
  }, [charList, keyword, filterActive, matchesView]);

  const handleSelect = itemId => {
    // push 一筆，讓詳情頁返回時回到同一本簿子的同一位角色。
    setSearchParams(buildParams(orderType, itemKind, itemId));
  };

  const handleBackToAll = () => setSearchParams(buildParams(orderType, itemKind, null));

  const handleSwitchBook = next => {
    if (next === orderType) return;
    // 帶著 characterId 一起換：多數時候同一位角色兩本都有，換過去還能接著看。
    // 真的沒有時，上面那個「清掉不存在的 characterId」的 effect 會在新清單到齊後收尾，
    // 所以這裡不需要先猜。搜尋字保留，視角回到「全部」——filtered 在兩本的語意相反，
    // 沿用會讓人以為看到的是同一批角色。
    setView("all");
    setSearchParams(buildParams(next, itemKind, queryId));
  };

  // 換種類同理：角色與碎片的 filtered 語意也不一樣，視角一併歸零。
  const handleSwitchKind = next => {
    if (next === itemKind) return;
    setView("all");
    setSearchParams(buildParams(orderType, next, queryId));
  };

  const handleConfirmAction = async () => {
    if (!pending) return;
    const isBuyBook = orderType === "buy";
    const pendingIsFragment = normalizeItemKind(pending.itemKind) === "fragment";
    const pendingTotal = totalOf(pending);
    const label = itemLabel(pending);
    const amount = pendingIsFragment ? ` ${quantityOf(pending)} 片` : "";
    try {
      const { data } = await submitAction({
        url: isBuyBook
          ? `/api/public-market/listings/${pending.id}/fulfill`
          : `/api/public-market/listings/${pending.id}/purchase`,
      });
      setPending(null);
      // 成交後的金額一律用「總額」講，不是單價 —— 那才是真的進出錢包的數字。
      const dealTotal = Number(data.total) > 0 ? Number(data.total) : pendingTotal;
      handleOpen(
        isBuyBook
          ? `已賣出 ${label}${amount}，實收 ${fmtStone(data.netProceeds ?? calcNet(dealTotal))} 女神石`
          : `已購買 ${label}${amount}，花費 ${fmtStone(dealTotal)} 女神石`,
        "success"
      );
      refetchSummary();
      loadCharacters(orderType, itemKind);
      refetchInventory().catch(() => {});
      if (fragment) refetchFragments().catch(() => {});
      if (selectedId) loadListings(selectedId, orderType, itemKind);
    } catch (err) {
      setPending(null);
      handleOpen(
        errorText(err, isBuyBook ? "賣出失敗，請稍後再試" : "購買失敗，請稍後再試", {
          fragment: pendingIsFragment,
        }),
        "error"
      );
      refetchSummary();
      refetchInventory().catch(() => {});
      if (fragment) refetchFragments().catch(() => {});
      if (selectedId) loadListings(selectedId, orderType, itemKind);
    }
  };

  if (!isLoggedIn) return <AlertLogin />;

  const hasMine = rows.some(r => r.mine);
  const balance = summary?.balance;
  // 切到會用到持有資料的視角但資料還沒回來：先擋住清單，不能亂猜。
  const waitingInventory =
    view === "filtered" && !viewDataKnown && !(fragment && buy ? fragError : invError);
  const showPicker = !selected && !resolvingQuery;

  const filteredLabel = fragment
    ? buy
      ? "我有碎片的"
      : "我還缺的角色"
    : buy
      ? "我持有的"
      : "我沒有的";

  // Dialog 的金額全部以總額為基準。碎片單 total = 單價 × 片數，
  // 手續費與實收都算在 total 上，這裡絕不能拿 price 去算。
  const pendingIsFragment = pending ? normalizeItemKind(pending.itemKind) === "fragment" : false;
  const pendingTotal = pending ? totalOf(pending) : 0;
  const pendingQty = pending ? quantityOf(pending) : 1;
  const pendingNet = pending ? (pending.netProceeds ?? calcNet(pendingTotal)) : 0;
  const pendingFee = pending ? (pending.fee ?? calcFee(pendingTotal)) : 0;

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

      {/* 兩排切換：上排選標的（角色 / 碎片），下排選方向（出售 / 收購）。
          分兩排是刻意的 —— 這兩個維度互相獨立，四種組合都有意義。 */}
      <ItemKindSwitch value={itemKind} onChange={handleSwitchKind} />
      <OrderTypeSwitch value={orderType} onChange={handleSwitchBook} />

      <GradientPanel tone={orderType}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.75 }}>
          {fragment ? (buy ? "碎片收購簿" : "碎片掛單簿") : buy ? "公開收購簿" : "公開掛單簿"}
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2, fontSize: 12, lineHeight: 1.7, opacity: 0.92 }}>
          {fragment ? (
            buy ? (
              <>
                <li>這裡是別人想收的角色碎片，你有足夠片數就能賣給他</li>
                <li>價格是「每片」單價，實際金額是單價 × 片數</li>
                <li>成交時抽取 5% 手續費，你拿到的是扣完手續費的金額</li>
                <li>收購方發單時就已預扣全額，成交當下不會反悔</li>
              </>
            ) : (
              <>
                <li>價格是「每片」單價，你付的是單價 × 片數</li>
                <li>成交時抽取 5% 手續費，該部分女神石直接銷毀</li>
                <li>碎片沒有持有上限，已經擁有該角色也可以買碎片</li>
                <li>{`每 150 片可兌換該角色 1★，也可以 1 片換 1 女神石回收`}</li>
              </>
            )
          ) : buy ? (
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
            <Button
              color="inherit"
              size="small"
              onClick={() => loadCharacters(orderType, itemKind)}
            >
              重試
            </Button>
          }
        >
          載入{kindCopy.book}
          {buy ? "收購簿" : "掛單簿"}失敗，請稍後再試
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
                kind={fragment ? "fragment" : "character"}
              />
              <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                  <Typography sx={{ fontSize: 15, fontWeight: 600 }} noWrap>
                    {selected.name}
                    {fragment && (
                      <Box component="span" sx={{ fontWeight: 500, color: "text.secondary" }}>
                        碎片
                      </Box>
                    )}
                  </Typography>
                  <BaseStar star={selected.star} kind={fragment ? "fragment" : "character"} />
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ ...NUMS }}>
                  {selected.itemId} ・{" "}
                  {rowsPending
                    ? `讀取${copy.noun}中…`
                    : rowsFailed
                      ? `${copy.noun}讀取失敗`
                      : `目前 ${rows.length} 張${copy.noun}`}
                </Typography>
                {/* 碎片簿多寫一行「我手上有幾片」：買碎片要湊數、賣碎片要夠數，
                    這個數字是每一個決定的前提，不該讓人切回庫存頁才看得到。 */}
                {fragment && fragKnown && (
                  <Typography
                    variant="caption"
                    sx={{ display: "block", color: "secondary.main", fontWeight: 600, ...NUMS }}
                  >
                    你持有 {fmtStone(selectedFrags)} 片
                  </Typography>
                )}
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
                disabled={fragment && buy ? Boolean(fragError) : Boolean(invError)}
                aria-label={
                  fragment
                    ? buy
                      ? "只顯示我有碎片、可以賣出的角色"
                      : "只顯示我還沒有的角色，湊滿 150 片就能兌換"
                    : buy
                      ? "只顯示我持有、可以賣出的角色"
                      : "只顯示我還沒有的角色"
                }
              >
                {filteredLabel}
                {filteredCount === null ? "" : ` (${filteredCount})`}
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {invError && !(fragment && buy) && (
            <Alert severity="warning" sx={{ borderRadius: 3 }}>
              讀不到你的角色清單，先顯示全部角色。
            </Alert>
          )}
          {fragment && buy && fragError && (
            <Alert severity="warning" sx={{ borderRadius: 3 }}>
              讀不到你的碎片數量，先顯示全部角色。
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
                  fragment={fragment}
                  selected={String(c.itemId) === selectedId}
                  onClick={() => handleSelect(c.itemId)}
                />
              ))}
            </Box>
          )}
          {waitingInventory && (
            <Typography variant="body2" color="text.secondary" sx={{ px: 0.25 }} role="status">
              {fragment && buy ? "正在確認你手上有哪些碎片…" : "正在確認你已經擁有哪些角色…"}
            </Typography>
          )}
          {!charsLoading && !waitingInventory && filtered.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ px: 0.25, py: 0.75 }}>
              {filterActive
                ? keyword.trim()
                  ? `${filteredLabel}角色裡找不到符合的。`
                  : fragment
                    ? buy
                      ? "目前有人收購碎片的角色，你手上都沒有碎片。"
                      : "目前有碎片掛單的角色你都已經擁有了。"
                    : buy
                      ? "目前有人收購的角色，你都還沒有。"
                      : "目前有掛單的角色你都已經擁有了。"
                : charsLoaded && charList.length === 0
                  ? buy
                    ? `目前沒有任何${fragment ? "碎片" : ""}收購單。`
                    : `目前沒有任何${fragment ? "碎片" : ""}掛單。`
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
          {selected ? `${selected.name} 的${fragment ? "碎片" : ""}${copy.noun}` : copy.noun}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {!selected
            ? copy.sortNote
            : rowsPending
              ? "載入中…"
              : rowsFailed
                ? "讀取失敗"
                : rows.length
                  ? `${rows.length} 張 ・ ${copy.sortNote}${fragment ? "（每片單價）" : ""}`
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
              onClick={() => loadListings(selectedId, orderType, itemKind)}
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
          先從上面挑一個角色，就會看到目前的{fragment ? "碎片" : ""}
          {copy.noun}。
          {fragment
            ? buy
              ? "收購單是別人出價想收碎片，你手上的片數夠就能賣。價格都是每片單價。"
              : "碎片單的價格是每片單價，實際要付的是單價 × 片數。"
            : buy && "收購單是別人出價想買，你有那隻角色就能直接賣。"}
        </Note>
      )}

      {showSkeleton || resolvingQuery ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }} aria-busy="true">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} variant="rounded" height={88} animation="wave" />
          ))}
        </Box>
      ) : selected && rowsFailed ? null : selected && rows.length === 0 ? (
        <EmptyBook orderType={orderType} fragment={fragment} onBackToAll={handleBackToAll} />
      ) : (
        selected &&
        rows.length > 0 && (
          <>
            {/* 碎片的提示不能寫成「你沒有這個角色」——碎片是數量問題，不是有無問題。
                而且「已持有角色」在碎片簿裡完全不是阻擋條件，不該出現任何相關字樣。 */}
            {buy &&
              (fragment
                ? fragKnown &&
                  selectedFrags === 0 && (
                    <Alert severity="info" sx={{ borderRadius: 3 }}>
                      你目前沒有 {selected.name} 的碎片，只能看價格，沒辦法賣出。
                    </Alert>
                  )
                : ownedKnown &&
                  !ownsSelected && (
                    <Alert severity="info" sx={{ borderRadius: 3 }}>
                      你目前沒有 {selected.name}，只能看價格，沒辦法賣出。
                    </Alert>
                  ))}
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
                  blockReason={blockReasonFor(listing)}
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
        <Button
          variant="outlined"
          onClick={() => navigate(`/trade/sell${fragment ? "?itemKind=fragment" : ""}`)}
          sx={{ flex: "1 1 45%" }}
        >
          我要掛{fragment ? "碎片" : ""}賣單
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          onClick={() => navigate(`/trade/buy${fragment ? "?itemKind=fragment" : ""}`)}
          sx={{ flex: "1 1 45%" }}
        >
          我要發{fragment ? "碎片" : ""}收購單
        </Button>
      </Box>

      {/* 碎片簿多一個回庫存的出口：看完行情最常做的下一件事就是回去挑要賣哪些。 */}
      {fragment && (
        <Button variant="text" color="secondary" onClick={() => navigate("/gacha/fragments")}>
          管理我的碎片庫存
        </Button>
      )}

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
            {pendingIsFragment
              ? buy
                ? "賣出後碎片立刻從你的庫存扣除，此操作無法取消。"
                : "購買後碎片直接進入你的碎片庫存，此操作無法取消。"
              : buy
                ? "賣出後角色立刻離開你的box，升星強化不會轉移也不會退錢，此操作無法取消。"
                : "購買後角色直接進入你的box，此操作無法取消。"}
          </Typography>
          {pending && (
            <Box sx={{ mt: 1.5 }}>
              <Row label="標的" value={`${itemLabel(pending)}（${pending.itemId}）`} />
              {pendingIsFragment ? (
                <>
                  {/* 碎片的金額一定要三行分開寫：單價、片數、總價。
                      少了任何一行，就會有人把每片 50 當成整筆 50。 */}
                  <Row label="片數" value={`${fmtStone(pendingQty)} 片`} />
                  <Row
                    label={buy ? "每片收購價" : "每片售價"}
                    value={`${fmtStone(pending.price)} 女神石`}
                  />
                  <Row
                    label="總價（單價 × 片數）"
                    value={`${fmtStone(pendingTotal)} 女神石`}
                    valueColor={buy ? "secondary.main" : "primary.main"}
                  />
                  {Number(nativeStarOf(pending)) >= 1 && (
                    <Row
                      label="角色原生星數"
                      value={`${Number(nativeStarOf(pending))}★（碎片兌換一律取得 1★）`}
                      valueColor="text.secondary"
                    />
                  )}
                </>
              ) : (
                <>
                  {Number(pending.star) >= 1 && (
                    <Row
                      label={buy ? "對方會取得" : "你會取得"}
                      value={`基礎 ${Number(pending.star)} 星`}
                    />
                  )}
                  <Row
                    label={buy ? "收購價" : "售價"}
                    value={`${fmtStone(pending.price)} 女神石`}
                  />
                </>
              )}
              <Row label={copy.poster} value={displayName(posterNameOf(pending))} />
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
                  {pendingIsFragment && fragKnown && (
                    <Row
                      label="你的碎片"
                      value={`${fmtStone(selectedFrags)} → ${fmtStone(Math.max(0, selectedFrags - pendingQty))} 片`}
                    />
                  )}
                </>
              ) : (
                <>
                  <Row
                    label="你的餘額"
                    value={`${fmtStone(balance)} → ${fmtStone((balance ?? 0) - pendingTotal)} 女神石`}
                  />
                  {pendingIsFragment && fragKnown && (
                    <Row
                      label="你的碎片"
                      value={`${fmtStone(selectedFrags)} → ${fmtStone(selectedFrags + pendingQty)} 片`}
                      valueColor="secondary.main"
                    />
                  )}
                </>
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
