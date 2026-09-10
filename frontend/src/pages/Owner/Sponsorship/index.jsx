import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Paper,
  Typography,
  Chip,
  Button,
  Divider,
  Skeleton,
  Alert,
  ToggleButton,
  ToggleButtonGroup,
  Pagination,
  Stack,
} from "@mui/material";
import VolunteerActivismIcon from "@mui/icons-material/VolunteerActivism";
import AddIcon from "@mui/icons-material/Add";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import CardGiftcardIcon from "@mui/icons-material/CardGiftcard";
import * as svc from "../../../services/sponsorship";
import { Hero, TypeChip } from "./_shared";
import { fmtAmount, fmtDate, playerLabel, errorMessage } from "./_format";
import PlayerSearch from "./PlayerSearch";

const PER_PAGE = 20;

const toggleSx = {
  flexWrap: "wrap",
  gap: 1,
  "& .MuiToggleButtonGroup-grouped": {
    border: "1px solid",
    borderColor: "divider",
    borderRadius: "8px !important",
    "&:not(:first-of-type)": { ml: 0, borderLeft: "1px solid", borderColor: "divider" },
  },
};

export default function SponsorshipList() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState("all");
  const [bound, setBound] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const params = { page, perPage: PER_PAGE };
      if (type !== "all") params.type = type;
      if (bound !== "all") params.bound = bound;
      const data = await svc.fetchSponsorships(params);
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(errorMessage(e, "載入失敗，請重試"));
    } finally {
      setLoading(false);
    }
  }, [page, type, bound]);

  useEffect(() => {
    document.title = "贊助管理";
    load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Hero
        icon={<VolunteerActivismIcon />}
        title="贊助管理"
        subtitle="登記贊助、發放序號、補綁歷史紀錄。送出後的紀錄不可修改。"
      >
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate("/owner/sponsorships/new")}
          sx={{
            bgcolor: "rgba(255,255,255,0.22)",
            color: "#fff",
            "&:hover": { bgcolor: "rgba(255,255,255,0.32)" },
          }}
        >
          新增登記
        </Button>
      </Hero>

      <Paper sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: 3 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          查玩家累積贊助
        </Typography>
        <PlayerSearch
          placeholder="輸入玩家名稱或 LINE userId"
          onSelect={p => navigate(`/owner/sponsorships/players/${p.id}`)}
        />
      </Paper>

      <Stack
        direction="row"
        spacing={1.5}
        useFlexGap
        sx={{ flexWrap: "wrap", alignItems: "center" }}
      >
        <ToggleButtonGroup
          exclusive
          size="small"
          color="primary"
          value={type}
          onChange={(e, v) => {
            if (v) {
              setType(v);
              setPage(1);
            }
          }}
          sx={toggleSx}
          aria-label="類型篩選"
        >
          <ToggleButton value="all">全部</ToggleButton>
          <ToggleButton value="new">新贊助</ToggleButton>
          <ToggleButton value="history">歷史補登</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          exclusive
          size="small"
          color="secondary"
          value={bound}
          onChange={(e, v) => {
            if (v) {
              setBound(v);
              setPage(1);
            }
          }}
          sx={toggleSx}
          aria-label="綁定篩選"
        >
          <ToggleButton value="all">不限綁定</ToggleButton>
          <ToggleButton value="true">已綁定</ToggleButton>
          <ToggleButton value="false">未綁定</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
          共 {total} 筆
        </Typography>
      </Stack>

      <Paper sx={{ borderRadius: 3, overflow: "hidden" }}>
        {loading ? (
          [0, 1, 2].map(i => (
            <Box key={i} sx={{ px: { xs: 2, sm: 3 }, py: 2 }}>
              <Skeleton variant="rounded" height={56} />
            </Box>
          ))
        ) : error ? (
          <Box sx={{ p: 3 }}>
            <Alert severity="error" action={<Button onClick={load}>重試</Button>}>
              {error}
            </Alert>
          </Box>
        ) : items.length === 0 ? (
          <Box sx={{ p: 6, textAlign: "center" }}>
            <VolunteerActivismIcon sx={{ fontSize: 48, opacity: 0.3 }} />
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              目前沒有符合的贊助紀錄
            </Typography>
          </Box>
        ) : (
          items.map((s, idx) => (
            <Box key={s.id}>
              {idx > 0 && <Divider />}
              <Box
                component="button"
                type="button"
                onClick={() => navigate(`/owner/sponsorships/${s.id}`)}
                aria-label={`查看贊助 #${s.id}`}
                sx={{
                  all: "unset",
                  boxSizing: "border-box",
                  width: "100%",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  px: { xs: 2, sm: 3 },
                  py: { xs: 1.75, sm: 2 },
                  "&:hover, &:focus-visible": { bgcolor: "action.hover" },
                  "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack
                    direction="row"
                    spacing={1}
                    useFlexGap
                    sx={{ alignItems: "center", flexWrap: "wrap" }}
                  >
                    <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      NT$ {fmtAmount(s.amount)}
                    </Typography>
                    <TypeChip type={s.type} />
                    {s.userId === null ? (
                      <Chip
                        icon={<LinkOffIcon sx={{ fontSize: "14px !important" }} />}
                        label="未綁定"
                        size="small"
                        color="warning"
                        variant="outlined"
                      />
                    ) : (
                      <Chip label={playerLabel(s.userId)} size="small" variant="outlined" />
                    )}
                    {s.cardCount > 0 && (
                      <Chip
                        icon={<CardGiftcardIcon sx={{ fontSize: "14px !important" }} />}
                        label={`${s.cardKey} ×${s.cardCount}`}
                        size="small"
                        color="secondary"
                        variant="outlined"
                      />
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                    #{s.id} · 入帳 {fmtDate(s.receivedAt)}
                    {s.paymentMethod ? ` · ${s.paymentMethod}` : ""}
                    {s.externalRef ? ` · ${s.externalRef}` : ""}
                  </Typography>
                </Box>
                <ChevronRightIcon color="action" />
              </Box>
            </Box>
          ))
        )}
      </Paper>

      {pageCount > 1 && (
        <Pagination
          count={pageCount}
          page={page}
          onChange={(e, v) => setPage(v)}
          color="primary"
          sx={{ alignSelf: "center" }}
        />
      )}
    </Box>
  );
}
