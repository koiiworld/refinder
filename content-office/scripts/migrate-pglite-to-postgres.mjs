// 맥의 내장 DB(PGlite) → Supabase/PostgreSQL 로 데이터 옮기기 (한 번만 실행)
// 사용법: node scripts/migrate-pglite-to-postgres.mjs <PGlite 폴더 복사본> <DATABASE_URL 이 들어 있는 파일>
// - 대상 DB에 db/schema.sql 을 먼저 적용하고, 표마다 행을 복사합니다 (이미 있는 행은 건너뜀)
// - 연결 문자열은 화면에 출력하지 않습니다
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const [src, urlFile] = process.argv.slice(2);
if (!src || !urlFile) {
  console.error("사용법: node scripts/migrate-pglite-to-postgres.mjs <PGlite 폴더> <DATABASE_URL 파일>");
  process.exit(1);
}
const url = fs.readFileSync(urlFile, "utf8").trim();
const schema = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "..", "db", "schema.sql"), "utf8");

// 외래 키 순서 (먼저 와야 하는 표부터). 목록에 없는 표는 맨 뒤에 복사
const ORDER = ["blogs", "settings", "prompts", "blog_samples", "keyword_stats", "season_keywords", "marketing_events", "research_snapshots", "ideas", "keyword_picks", "projects", "documents", "versions", "approvals", "reviews", "jobs", "ai_runs", "events", "media_jobs", "trend_scraps", "blog_visits"];

const lite = await PGlite.create(src);
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 2 });

console.log("1) 대상 DB에 표 만들기 (schema.sql)");
await pool.query(schema);

const tables = (await lite.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows.map((r) => r.table_name);
const ordered = [...ORDER.filter((t) => tables.includes(t)), ...tables.filter((t) => !ORDER.includes(t))];

let total = 0;
for (const t of ordered) {
  const cols = (await lite.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [t])).rows;
  const target = new Set((await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [t])).rows.map((r) => r.column_name));
  const use = cols.filter((c) => target.has(c.column_name));
  if (!use.length) {
    console.log(`   - ${t}: 대상에 없는 표, 건너뜀`);
    continue;
  }
  const rows = (await lite.query(`SELECT * FROM "${t}"`)).rows;
  let n = 0;
  for (const r of rows) {
    const vals = use.map((c) => (r[c.column_name] != null && /json/.test(c.data_type) ? JSON.stringify(r[c.column_name]) : r[c.column_name]));
    const sql = `INSERT INTO "${t}" (${use.map((c) => `"${c.column_name}"`).join(",")}) VALUES (${use.map((_, i) => `$${i + 1}`).join(",")}) ON CONFLICT DO NOTHING`;
    const res = await pool.query(sql, vals);
    n += res.rowCount ?? 0;
  }
  total += n;
  console.log(`   - ${t}: ${rows.length}행 중 ${n}행 복사`);
}
console.log(`2) 완료: 총 ${total}행`);
await pool.end();
await lite.close();
