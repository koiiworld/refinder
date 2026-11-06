import { body, fail, handle, ok } from "@/lib/api";
import { createTodo, listTodos } from "@/lib/todos";

export async function GET(req: Request) {
  return handle(async () => {
    const tab = new URL(req.url).searchParams.get("tab");
    return ok(await listTodos(tab === "upcoming" || tab === "done" ? tab : "today"));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const b = await body<Parameters<typeof createTodo>[0]>(req);
    try {
      return ok(await createTodo(b));
    } catch (e) {
      return fail((e as Error).message);
    }
  });
}
