// 코드 지도(CODEMAP.md) 자동 생성: 폴더·파일마다 맨 위 설명 주석 한 줄 + 내보내는 함수 이름
// 사용: node scripts/codemap.mjs   (content-office 폴더에서)
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dirs = ["src/lib", "src/lib/ai", "src/app", "src/components", "scripts", "tests"];
const skip = /node_modules|\.next/;

function describe(file) {
  const src = fs.readFileSync(file, "utf8");
  const block = /\/\*\*([\s\S]*?)\*\//.exec(src.slice(0, 4000))?.[1];
  const line = /^\s*\/\/\s*(.+)$/m.exec(src.slice(0, 600))?.[1];
  const first = block ? block.split("\n").map((l) => l.replace(/^\s*\*\s?/, "").trim()).filter((l) => l && !l.startsWith("@"))[0] : line;
  const exports = [...src.matchAll(/^export (?:async )?(?:function|const|class|type|interface) (\w+)/gm)].map((m) => m[1]);
  return { first: (first ?? "").replace(/\|/g, "/").slice(0, 140), exports };
}

function walk(dir, depth = 0) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const name of fs.readdirSync(abs).sort()) {
    const rel = path.join(dir, name);
    if (skip.test(rel)) continue;
    const st = fs.statSync(path.join(root, rel));
    if (st.isDirectory()) {
      if (dir === "src/app" || depth > 0) out.push(...walk(rel, depth + 1));
      continue;
    }
    if (!/\.(ts|tsx|mjs|sh)$/.test(name)) continue;
    out.push(rel);
  }
  return out;
}

let md = `# 코드 지도 (자동 생성)\n\n\`node scripts/codemap.mjs\` 로 다시 만듭니다. 파일마다 맨 위 설명 한 줄과 내보내는 이름입니다.\n작업 전에 이 지도에서 관련 파일을 먼저 찾고, 자세한 규칙은 HANDOFF.md 를 보세요.\n`;
for (const dir of dirs) {
  const files = walk(dir).filter((f) => dir === "src/app" || path.dirname(f) === dir);
  if (!files.length) continue;
  md += `\n## ${dir}\n\n| 파일 | 설명 | 내보내는 것 |\n|---|---|---|\n`;
  for (const f of files) {
    const d = describe(path.join(root, f));
    md += `| \`${f.replace(dir + "/", "")}\` | ${d.first} | ${d.exports.slice(0, 8).join(", ")}${d.exports.length > 8 ? " …" : ""} |\n`;
  }
}
fs.writeFileSync(path.join(root, "CODEMAP.md"), md);
console.log("CODEMAP.md 작성:", md.split("\n").length, "줄");
