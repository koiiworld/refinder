import "server-only";
import { NextResponse } from "next/server";
import { WorkflowError } from "./workflow";

export type Ctx<P extends Record<string, string> = { id: string }> = { params: Promise<P> };

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof WorkflowError) return fail(e.message, 400);
    console.error(e);
    return fail(e instanceof Error ? e.message : "서버 오류", 500);
  }
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
