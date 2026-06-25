import { useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";
import WordCloud from "wordcloud";

// wordcloud2.js is a vanilla canvas library: it draws straight onto a <canvas>
// DOM node. It does not touch React's reconciler, so we own one ref to the
// canvas, (re)draw inside an effect whenever the data or size changes, and clear
// on unmount. Nothing here "fights" React 19 — React only owns the <canvas>
// element; wordcloud2 owns its pixels.

// Cyan→amber ramp, matching the in-chat Flex bar ramp and the chat-level cyan
// feature accent (theme primary #00ACC1 / secondary #F59E0B). The biggest words
// get the brightest cyan; the long tail fades toward amber so the cloud reads as
// a single coherent object rather than confetti.
const RAMP = ["#00838F", "#00ACC1", "#26C6DA", "#5BC8D6", "#9AD9B0", "#F6B247", "#F59E0B"];

function colorForWeight(weight, maxWeight) {
  if (!maxWeight) return RAMP[0];
  const ratio = 1 - Math.min(1, weight / maxWeight); // 0 = biggest
  const idx = Math.min(RAMP.length - 1, Math.round(ratio * (RAMP.length - 1)));
  return RAMP[idx];
}

/**
 * 把字頻畫成真正的文字雲。字級／顏色依次數縮放。
 * @param {object} props
 * @param {Array<{keyword: string, count: number}>} props.items desc by count
 * @param {number} [props.height=320]
 */
export default function WordCloudCanvas({ items, height = 320 }) {
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
      color: (_word, weight) => colorForWeight(weight, maxWeight),
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
  }, [items, width, height]);

  return (
    <Box ref={wrapRef} sx={{ width: "100%" }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height, display: "block" }}
        aria-label="文字雲"
        role="img"
      />
    </Box>
  );
}
