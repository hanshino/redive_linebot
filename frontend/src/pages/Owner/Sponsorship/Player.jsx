import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link as RouterLink } from "react-router-dom";
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Alert,
  Divider,
  Chip,
  Skeleton,
} from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import * as svc from "../../../services/sponsorship";
import { Hero, TypeChip } from "./_shared";
import { fmtAmount, fmtDate, errorMessage } from "./_format";

export default function SponsorshipPlayer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setData(await svc.fetchPlayerSummary(id));
    } catch (e) {
      setError(errorMessage(e, "載入失敗"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    document.title = `玩家 #${id} 贊助`;
    load();
  }, [id, load]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5, maxWidth: 760, mx: "auto" }}>
      <Hero icon={<PersonIcon />} title={`玩家 #${id}`} subtitle="累積登記贊助金額（TWD）">
        <Button
          component={RouterLink}
          to="/owner/sponsorships"
          startIcon={<ArrowBackIcon />}
          sx={{ color: "#fff" }}
        >
          回列表
        </Button>
      </Hero>

      {loading ? (
        <Paper sx={{ p: 3, borderRadius: 3 }}>
          <Skeleton height={56} width="50%" />
          <Skeleton height={24} />
        </Paper>
      ) : error ? (
        <Alert severity="error" action={<Button onClick={load}>重試</Button>}>
          {error}
        </Alert>
      ) : (
        <>
          <Paper sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: 3, textAlign: "center" }}>
            <Typography variant="overline" color="text.secondary">
              累積登記贊助
            </Typography>
            <Typography
              variant="h3"
              sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}
            >
              NT$ {fmtAmount(data.totalAmount)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              共 {data.sponsorships.length} 筆登記，僅計入已綁定此玩家的紀錄
            </Typography>
          </Paper>

          <Paper sx={{ borderRadius: 3, overflow: "hidden" }}>
            {data.sponsorships.length === 0 ? (
              <Box sx={{ p: 5, textAlign: "center" }}>
                <Typography color="text.secondary">尚無贊助紀錄</Typography>
              </Box>
            ) : (
              data.sponsorships.map((s, idx) => {
                const used = s.coupons.filter(c => c.status === 1).length;
                return (
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
                        py: 1.75,
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
                          {s.coupons.length > 0 && (
                            <Chip
                              label={`序號 ${used}/${s.coupons.length} 已用`}
                              size="small"
                              variant="outlined"
                              color="secondary"
                            />
                          )}
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          #{s.id} · 入帳 {fmtDate(s.receivedAt)}
                          {s.boundAt ? ` · 補綁於 ${fmtDate(s.boundAt)}` : ""}
                        </Typography>
                      </Box>
                      <ChevronRightIcon color="action" />
                    </Box>
                  </Box>
                );
              })
            )}
          </Paper>
        </>
      )}
    </Box>
  );
}
