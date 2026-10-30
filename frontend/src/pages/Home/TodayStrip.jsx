import { Link as RouterLink } from "react-router-dom";
import { Box, Skeleton, Typography } from "@mui/material";
import LoadError from "../../components/LoadError";
import { displayFont } from "../../theme";

// 只列有真資料撐腰的項目：簽到（/api/me/signins）、世界王今日額度（/api/world-boss/me，沒開季就不列）。
function buildItems(signins, boss) {
  const signed = Boolean(signins.entries?.some(e => e.date === signins.today));
  const items = [
    { key: "signin", done: signed, text: signed ? "今日簽到" : "今天還沒簽到", to: "/signin" },
  ];
  const daily = boss?.current?.daily;
  if (daily) {
    const done = daily.remaining <= 0;
    items.push({
      key: "worldboss",
      done,
      to: "/worldboss",
      text: done ? (
        "世界王"
      ) : (
        <>
          世界王 今日額度剩{" "}
          <Box component="b" sx={{ fontFamily: displayFont, fontVariantNumeric: "tabular-nums" }}>
            {daily.remaining.toLocaleString()}
          </Box>
        </>
      ),
    });
  }
  // 沒做完的排前面
  return items.sort((a, b) => a.done - b.done);
}

function Mark({ done }) {
  return (
    <Box
      aria-hidden="true"
      sx={{
        width: 20,
        height: 20,
        flex: "none",
        borderRadius: "6px",
        display: "grid",
        placeItems: "center",
        border: "2px solid",
        borderColor: done ? "divider" : "secondary.light",
        bgcolor: done ? "surface.inset" : "currency.bg",
      }}
    >
      {done ? (
        <Box
          sx={{
            width: 10,
            height: 5,
            borderLeft: "2px solid",
            borderBottom: "2px solid",
            borderColor: "text.secondary",
            transform: "rotate(-45deg) translateY(-1px)",
          }}
        />
      ) : (
        <Box sx={{ width: 8, height: 8, borderRadius: "2px", bgcolor: "secondary.light" }} />
      )}
    </Box>
  );
}

export default function TodayStrip({ signins, boss }) {
  const loading = signins.loading || boss.loading;
  const error = signins.error || boss.error;
  const items = !loading && !error ? buildItems(signins.data, boss.data) : [];
  const pending = items.filter(i => !i.done).length;

  const retry = () => {
    if (signins.error) signins.reload();
    if (boss.error) boss.reload();
  };

  return (
    <Box
      component="section"
      aria-labelledby="today-heading"
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "14px",
        bgcolor: "background.paper",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 1.125,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography
          id="today-heading"
          component="h2"
          sx={{
            fontFamily: displayFont,
            fontWeight: 700,
            fontSize: "0.875rem",
            letterSpacing: "0.06em",
          }}
        >
          今天未完成
        </Typography>
        {!loading && !error && (
          <Box
            component="span"
            sx={{
              ml: "auto",
              px: 1.125,
              py: 0.25,
              borderRadius: 999,
              fontSize: "0.75rem",
              fontWeight: 700,
              ...(pending > 0
                ? { color: "currency.main", bgcolor: "currency.bg" }
                : { color: "text.secondary", bgcolor: "surface.inset" }),
            }}
          >
            {pending > 0 ? `${pending} 件` : "全部完成"}
          </Box>
        )}
      </Box>

      {loading ? (
        <Box sx={{ px: 1.5, py: 1, display: "grid", gap: 1 }}>
          <Skeleton variant="rounded" height={30} />
          <Skeleton variant="rounded" height={30} />
        </Box>
      ) : error ? (
        <LoadError message="今天的狀態載入失敗，請稍後再試。" onRetry={retry} sx={{ p: 1.5 }} />
      ) : (
        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
          {items.map(({ key, done, text, to }) => (
            <Box
              component="li"
              key={key}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.25,
                minHeight: 46,
                px: 1.5,
                py: 0.5,
                borderTop: "1px solid",
                borderColor: "divider",
                "&:first-of-type": { borderTop: 0 },
                color: done ? "text.secondary" : "text.primary",
              }}
            >
              <Mark done={done} />
              <Box
                component="span"
                sx={{
                  flex: 1,
                  fontWeight: 500,
                  ...(done && {
                    textDecoration: "line-through",
                    textDecorationColor: "currentColor",
                  }),
                }}
              >
                {text}
              </Box>
              {done ? (
                <Box component="span" sx={{ fontSize: "0.75rem", fontWeight: 700 }}>
                  已完成
                </Box>
              ) : (
                <Box
                  component={RouterLink}
                  to={to}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    minHeight: 44,
                    px: 0.5,
                    fontSize: "0.8125rem",
                    fontWeight: 700,
                    color: "primary.main",
                    textDecoration: "none",
                    "&:hover": { textDecoration: "underline" },
                  }}
                >
                  前往
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
