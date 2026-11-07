import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { q, q1, newId } from "./db";
import { enqueue } from "./jobs";

/**
 * 📄 문서 → 마크다운 (마이크로소프트 MarkItDown, 맥에서 무료)
 * - 파일을 올리면 잠깐 DB에 보관 → 맥이 markitdown 으로 변환 → 결과 글만 남기고 원본은 지움
 * - 사진으로 스캔한 PDF는 글자가 거의 안 나옴 (유료 OCR 은 쓰지 않음)
 */
export const CONVERT_EXT = ["pdf", "docx", "pptx", "xlsx", "xls", "html", "htm", "csv", "json", "xml", "txt", "md", "epub"];
export const MAX_CONVERT_BYTES = 20 * 1024 * 1024;
export type Conversion = { id: string; filename: string; size: number; status: "queued" | "running" | "done" | "error"; message: string; markdown: string; chars: number; created_at: string; updated_at: string };

const MD_BIN = () => process.env.MARKITDOWN_BIN || path.join(os.homedir(), ".ai-content-office", "ai-tools-venv", "bin", "markitdown");
const COLS = "id, filename, size, status, message, markdown, length(markdown) AS chars, created_at, updated_at";

export async function createConversion(filename: string, data: Buffer) {
  const ext = (/\.(\w+)$/.exec(filename)?.[1] ?? "").toLowerCase();
  if (!CONVERT_EXT.includes(ext)) throw new Error(`이 파일은 바꿀 수 없어요. (${CONVERT_EXT.join(", ")})`);
  if (data.length > MAX_CONVERT_BYTES) throw new Error("20MB 이하 파일만 올릴 수 있어요.");
  if (!data.length) throw new Error("빈 파일이에요.");
  const id = newId("md_");
  await q("INSERT INTO doc_conversions (id, filename, size, input, status, message) VALUES ($1,$2,$3,$4,'queued','맥에서 바꾸는 중 (맥이 꺼져 있으면 켜질 때)')", [id, filename.slice(0, 200), data.length, data]);
  await enqueue("doc_convert", { payload: { id }, maxAttempts: 1 });
  return id;
}

export async function listConversions() {
  return q<Conversion>(`SELECT id, filename, size, status, message, left(markdown, 300) AS markdown, length(markdown) AS chars, created_at, updated_at FROM doc_conversions ORDER BY created_at DESC LIMIT 100`);
}
export async function getConversion(id: string) {
  return q1<Conversion>(`SELECT ${COLS} FROM doc_conversions WHERE id=$1`, [id]);
}

export async function runConversion(id: string) {
  const row = await q1<{ filename: string; input: Buffer | Uint8Array | null }>("SELECT filename, input FROM doc_conversions WHERE id=$1", [id]);
  if (!row?.input) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "md-"));
  try {
    await q("UPDATE doc_conversions SET status='running', message='바꾸는 중', updated_at=NOW() WHERE id=$1", [id]);
    const ext = (/\.(\w+)$/.exec(row.filename)?.[1] ?? "txt").toLowerCase();
    const file = path.join(dir, `in.${ext}`);
    fs.writeFileSync(file, Buffer.from(row.input));
    if (!fs.existsSync(MD_BIN())) throw new Error("맥에 MarkItDown 이 설치되지 않았어요.");
    const { run } = await import("./reels");
    const r = await run(MD_BIN(), [file], { timeoutMs: 5 * 60 * 1000 });
    if (r.code !== 0) throw new Error(`변환 실패: ${r.err.trim().split("\n").filter(Boolean).pop()?.slice(0, 200) ?? r.code}`);
    const md = r.out.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
    const empty = md.replace(/\s/g, "").length < 20;
    await q("UPDATE doc_conversions SET status='done', markdown=$2, input=NULL, message=$3, updated_at=NOW() WHERE id=$1", [
      id, md.slice(0, 2_000_000),
      empty ? "글자를 거의 찾지 못했어요. 사진으로 스캔한 PDF는 글자를 뽑을 수 없어요." : md.length > 2_000_000 ? "너무 길어 앞부분 200만 자만 남겼어요." : "",
    ]);
  } catch (e) {
    await q("UPDATE doc_conversions SET status='error', input=NULL, message=$2, updated_at=NOW() WHERE id=$1", [id, (e as Error).message.slice(0, 300)]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
