import { useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import WordCloud from "wordcloud";

// wordcloud2.js is a vanilla canvas library: it draws straight onto a <canvas>
// DOM node. It does not touch React's reconciler, so we own one ref to the
// canvas, (re)draw inside an effect whenever the data or size changes, and clear
// on unmount. Nothing here "fights" React 19 — React only owns the <canvas>
// element; wordcloud2 owns its pixels.

// Cyan→amber ramp, matching the in-chat Flex bar ramp. 色值取自 theme.palette，
// 深淺模式各自通過對比：最大的字用 primary.main，長尾逐步轉向 secondary（焦糖 / 琥珀），
// 讓整團字讀起來是同一個物件而不是彩紙。canvas 吃實際色值，所以在元件裡建 ramp。
function buildRamp(palette) {
  return [
    palette.primary.main,
    palette.primary.main,
    palette.primary.light,
    palette.success.main,
    palette.secondary.main,
    palette.secondary.main,
    palette.secondary.main,
  ];
}

function colorForWeight(ramp, weight, maxWeight) {
  if (!maxWeight) return ramp[0];
  const ratio = 1 - Math.min(1, weight / maxWeight); // 0 = biggest
  const idx = Math.min(ramp.length - 1, Math.round(ratio * (ramp.length - 1)));
  return ramp[idx];
}

/**
 * 把字頻畫成真正的文字雲。字級／顏色依次數縮放。
 * @param {object} props
 * @param {Array<{keyword: string, count: number}>} props.items desc by count
 * @param {number} [props.height=320]
 */
export default function WordCloudCanvas({ items, height = 320 }) {
  const theme = useTheme();
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);

  // Track the container width so the cloud fills the card and reflows on resize.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width || !Array.isArray(items) || items.length === 0) return undefined;

    // wordcloud2 wants [word, weight] pairs; weight drives font size. Gamma-
    // compress so the long tail stays legible next to one or two giant terms.
    const list = items.map(it => [it.keyword, Math.max(1, Math.pow(it.count, 0.8))]);
    const maxWeight = Math.max(...list.map(([, w]) => w));
    const ramp = buildRamp(theme.palette);

    // Scale the canvas for crisp text on hi-dpi screens.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    WordCloud(canvas, {
      list,
      gridSize: Math.max(8, Math.round((16 * width) / 1024)),
      weightFactor: w => (w / maxWeight) * (height / 6) * dpr,
      fontFamily: '"Noto Sans TC", "Helvetica Neue", Arial, sans-serif',
      fontWeight: "700",
      color: (_word, weight) => colorForWeight(ramp, weight, maxWeight),
      backgroundColor: "transparent",
      rotateRatio: 0.3,
      rotationSteps: 2,
      shrinkToFit: true,
      drawOutOfBound: false,
      clearCanvas: true,
    });

    return () => {
      WordCloud.stop();
    };
  }, [items, width, height, theme]);

  // canvas 讀不出內容：把最常出現的詞放進 aria-label
  const topWords = (items || [])
    .slice(0, 5)
    .map(it => it.keyword)
    .join("、");

  return (
    <Box ref={wrapRef} sx={{ width: "100%" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height, display: "block" }}
        aria-label={topWords ? `文字雲，最常出現的詞：${topWords}` : "文字雲"}
        role="img"
      />
    </Box>
  );
}
