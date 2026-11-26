/**
 * 🔲 나란히 놓기: 한 화면에 영상 여러 개를 칸으로 나눠 놓는 계산 (영상 편집기 오버레이용)
 * - 결과는 오버레이 좌표 그대로: x·y = 칸 가운데(%), w = 화면 너비 %, h = 화면 높이 %
 * - 간격·여백은 화면 짧은 쪽 길이의 % (가로·세로 간격이 눈으로 똑같아 보이게)
 */
export type GridDir = "row" | "col" | "grid";
export type GridShape = "fill" | "square" | "tall" | "wide";
export const GRID_DIR: [GridDir, string][] = [["row", "가로 한 줄"], ["col", "세로 한 줄"], ["grid", "바둑판"]];
export const GRID_SHAPE: [GridShape, string][] = [["fill", "화면 꽉 (나눠 채우기)"], ["square", "정사각형"], ["tall", "세로 (9:16)"], ["wide", "가로 (16:9)"]];
const SHAPE_AR: Record<Exclude<GridShape, "fill">, number> = { square: 1, tall: 9 / 16, wide: 16 / 9 };

export type Cell = { x: number; y: number; w: number; h: number };

export function gridSize(n: number, dir: GridDir) {
  if (dir === "row") return { cols: n, rows: 1 };
  if (dir === "col") return { cols: 1, rows: n };
  const cols = Math.ceil(Math.sqrt(n));
  return { cols, rows: Math.ceil(n / cols) };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function layoutCells(o: { n: number; dir: GridDir; shape: GridShape; gap: number; margin: number; W: number; H: number }): Cell[] {
  const n = Math.max(1, Math.min(12, Math.round(o.n)));
  const { cols, rows } = gridSize(n, o.dir);
  const unit = Math.min(o.W, o.H) / 100;
  const g = Math.max(0, o.gap) * unit;
  const m = Math.max(0, o.margin) * unit;
  let cw = Math.max(1, (o.W - 2 * m - (cols - 1) * g) / cols);
  let ch = Math.max(1, (o.H - 2 * m - (rows - 1) * g) / rows);
  if (o.shape !== "fill") {
    const ar = SHAPE_AR[o.shape];
    if (cw / ch > ar) cw = ch * ar;
    else ch = cw / ar;
  }
  const blockH = rows * ch + (rows - 1) * g;
  const oy = (o.H - blockH) / 2;
  const out: Cell[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    // 마지막 줄이 덜 찼으면 가운데로
    const inRow = row === rows - 1 ? n - row * cols : cols;
    const rowW = inRow * cw + (inRow - 1) * g;
    const ox = (o.W - rowW) / 2;
    const cx = ox + col * (cw + g) + cw / 2;
    const cy = oy + row * (ch + g) + ch / 2;
    out.push({ x: r2((cx / o.W) * 100), y: r2((cy / o.H) * 100), w: r2((cw / o.W) * 100), h: r2((ch / o.H) * 100) });
  }
  return out;
}
