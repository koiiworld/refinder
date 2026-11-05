import "server-only";
import fs from "node:fs";
import path from "node:path";
import { seedIfEmpty } from "./seed";

/**
 * 데이터베이스 어댑터
 * - DATABASE_URL 이 있으면 PostgreSQL(Supabase 포함)에 pg 드라이버로 접속
 * - 없으면 PGlite(WASM 내장 PostgreSQL)를 ./data/pglite 에 파일로 저장
 * 두 경우 모두 동일한 SQL과 $1 형식 파라미터를 사용합니다.
 */

type Row = Record<string, unknown>;

interface Driver {
  kind: "postgres" | "pglite";
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
}

const g = globalThis as unknown as { __dbPromise?: Promise<Driver> };

async function createDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const { Pool, types } = await import("pg");
    // NUMERIC → number, BIGINT(count) → number
    types.setTypeParser(1700, (v: string) => Number(v));
    types.setTypeParser(20, (v: string) => Number(v));
    const pool = new Pool({
      connectionString: url,
      max: 5,
      ssl: /supabase|sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined,
    });
    return {
      kind: "postgres",
      async query<T>(sql: string, params: unknown[] = []) {
        const res = await pool.query(sql, params as unknown[]);
        return res.rows as T[];
      },
      async exec(sql: string) {
        await pool.query(sql);
      },
    };
  }

  // Render 같은 클라우드 무료 서버(512MB)에서는 내장 DB(PGlite)가 메모리를 ~500MB 써서 꺼짐 → 외부 DB 필수
  if (process.env.RENDER || process.env.REQUIRE_EXTERNAL_DB === "1") {
    throw new Error("DATABASE_URL(Supabase 연결 주소)이 설정되지 않았습니다. Render > Environment 에 넣어 주세요.");
  }
  const { PGlite, types } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR || path.join(process.cwd(), "data", "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const db = await PGlite.create(dir, {
    parsers: {
      [types.NUMERIC]: (v: string) => Number(v),
      [types.INT8]: (v: string) => Number(v),
    },
  });
  return {
    kind: "pglite",
    async query<T>(sql: string, params: unknown[] = []) {
      const res = await db.query(sql, params as unknown[]);
      return res.rows as T[];
    },
    async exec(sql: string) {
      await db.exec(sql);
    },
  };
}

async function init(): Promise<Driver> {
  const driver = await createDriver();
  const schema = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await driver.exec(schema);
  await seedIfEmpty(driver.query.bind(driver));
  return driver;
}

export function getDb(): Promise<Driver> {
  if (!g.__dbPromise) {
    g.__dbPromise = init().catch((err) => {
      g.__dbPromise = undefined;
      throw err;
    });
  }
  return g.__dbPromise;
}

export async function q<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  const rows = await db.query<Row>(sql, params);
  // Date 객체는 ISO 문자열로 통일 (서버/클라이언트 직렬화 일관성)
  for (const r of rows) {
    for (const k in r) if (r[k] instanceof Date) r[k] = (r[k] as Date).toISOString();
  }
  return rows as T[];
}

export async function q1<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}

export async function dbKind() {
  return (await getDb()).kind;
}

export function newId(prefix = ""): string {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

/** JSONB 파라미터 직렬화 */
export function j(v: unknown): string {
  return JSON.stringify(v ?? null);
}
