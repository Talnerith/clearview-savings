import { readFileSync } from "node:fs";
import path from "node:path";

import { Path, Svg } from "@react-pdf/renderer";

// PDF-side brand icon. The HTML side references the SVG file at /branding/...
// via <img>; @react-pdf/renderer can't load external SVGs, so we read the same
// file on disk once, extract <path fill d /> tuples, cache, and emit them as
// @react-pdf <Svg><Path /></Svg>. Single source of truth at
// public/branding/clearview-savings-icon.svg.

const SVG_PATH = path.join(
  process.cwd(),
  "public",
  "branding",
  "clearview-savings-icon.svg",
);
const PATH_RE = /<path\s+fill="([^"]+)"\s+d="([^"]+)"\s*\/>/g;

// Hardcoded to the FULL lockup viewBox, deliberately wider than the SVG file's
// declared viewBox. The asset on disk uses a cropped viewBox (sun+wave only)
// so that HTML/favicon/email renders show just the mark next to a separate
// wordmark — but the path data still spans the full original 627x627 canvas,
// including the in-SVG "CLEARVIEW SAVINGS" typographic mark. PDFs render the
// full lockup (mark + in-SVG wordmark) because there's no separate wordmark
// next to it on the check letterhead or workbook cover.
const VIEWBOX = "0 0 627 627";

type ParsedPath = { fill: string; d: string };
let cached: ParsedPath[] | null = null;

function loadPaths(): ParsedPath[] {
  if (cached) return cached;
  const content = readFileSync(SVG_PATH, "utf8");
  const out: ParsedPath[] = [];
  for (const m of content.matchAll(PATH_RE)) {
    const fill = m[1];
    const d = m[2];
    if (!fill || !d) continue;
    out.push({ fill, d });
  }
  cached = out;
  return out;
}

export function BrandIconPdf({ size = 36 }: { size?: number }) {
  const paths = loadPaths();
  return (
    <Svg width={size} height={size} viewBox={VIEWBOX}>
      {paths.map((p, i) => (
        <Path key={i} fill={p.fill} d={p.d} />
      ))}
    </Svg>
  );
}
