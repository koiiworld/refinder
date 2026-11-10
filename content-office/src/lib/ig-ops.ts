import "server-only";
import { q, q1, newId, j } from "./db";
import { getBlogForAi } from "./repo";
import { extractJson, runStep } from "./ai/run";
import { HOOKS, PROFILE_RUBRIC, isIgTool, parseViralRows, rankOutliers, spokenSeconds, type IgTool } from "./ig-ops-types";

/**
 * 📱 인스타 운영: 릴스 대본 · 댓글 답글 · 프로필 점수 · 주간 계획 · 잘 된 영상 찾기
 * - 버튼을 누를 때만 AI 1회 (캐러셀 문구와 같은 담당 AI) → ig_ops 표에 보관, 지우면 휴지통
 * - '내 말투'는 settings(key='ig_voice')에 저장해 모든 도구가 읽음
 */
export type IgRun = { id: string; tool: IgTool; title: string; blog_id: string | null; input: Record<string, unknown>; result: Record<string, unknown>; model: string; created_at: string };

const HUMAN = `[사람 말투 규칙 — 반드시]
- AI 티 나는 말 금지: "~에 대해 알아보겠습니다", "결론적으로", "다양한", "효과적인", "핵심은", "꿀팁 대방출", "놓치지 마세요", "여러분" 남발, 과한 느낌표·이모지 나열, 줄표(—).
- 소리 내 읽어도 자연스러운 짧은 문장. 과장·거짓 숫자·검증 안 된 효능 주장 금지. 입력에 없는 사실을 지어내지 말 것.`;

export async function getVoice() {
  return (await q1<{ value: { text?: string } }>("SELECT value FROM settings WHERE key='ig_voice'"))?.value?.text ?? "";
}
export async function saveVoice(text: string) {
  await q("INSERT INTO settings (key, value) VALUES ('ig_voice', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [j({ text: String(text).slice(0, 4000) })]);
  return getVoice();
}

export async function listIgRuns(tool?: string) {
  return q<IgRun>(
    `SELECT id, tool, title, blog_id, input, result, model, created_at FROM ig_ops ${tool ? "WHERE tool=$1" : ""} ORDER BY created_at DESC LIMIT 60`,
    tool ? [tool] : [],
  );
}

const s = (v: unknown, n = 4000) => String(v ?? "").trim().slice(0, n);

function build(tool: IgTool, inp: Record<string, string>, voice: string) {
  const voiceText = voice ? `[내 말투 — 이 사람이 직접 말하는 것처럼]\n${voice}` : "[내 말투] 아직 없음 → 담백하고 친근한 존댓말";
  const hooks = HOOKS.map(([n, name, t]) => `#${n} ${name}: ${t}`).join("\n");
  if (tool === "reel")
    return {
      title: s(inp.idea, 60),
      prompt: `${voiceText}\n[릴스 아이디어] ${s(inp.idea, 2000)}\n[목표 길이] ${Number(inp.seconds) || 30}초\n[후킹 공식 26가지]\n${hooks}
할 일:
1) 서로 다른 공식으로 후킹 3개. 각각 말로 하는 첫 문장(2초 안, 5~12단어)과 화면 첫 글자(1초 안에 읽힘, 15자 이내), 점수(0~100: 짧고 구체적·숫자/대상·손해나 이득·첫 단어에 핵심·'당신'에게 말 걸기), 이유 한 줄.
2) 점수가 가장 높은 후킹으로 전체 대본. 장면마다 말(자막)과 화면 글자를 나눠서, 목표 길이에 맞게.
3) 마지막에 저장·팔로우를 부르는 한 줄(강요 X).
아이디어가 너무 얇으면 "questions"에 먼저 물어볼 것 1~3개를 쓰고 대본은 있는 정보로만.
형식: {"hooks":[{"formula":번호,"spoken":"","onScreen":"","score":0,"why":""}],"best":0,"beats":[{"say":"","screen":""}],"cta":"","caption":"","questions":[""]}`,
    };
  if (tool === "reply")
    return {
      title: `댓글 ${s(inp.comments).split(/\n+/).filter(Boolean).length}개`,
      prompt: `${voiceText}\n[게시물 내용] ${s(inp.post, 1500) || "(없음)"}\n[댓글들 — 한 줄에 하나, '아이디: 내용'일 수 있음]\n${s(inp.comments, 8000)}
댓글마다 종류를 나누세요: KEYWORD(요청한 단어 댓글) · LEAD(내가 해결하는 문제를 말함) · SUBSTANCE(정보 추가·반대) · QUESTION(많은 사람이 궁금할 질문) · SUPPORT(응원·이모지·태그) · NOISE(광고·스팸·시비).
답글 규칙: 질문엔 답글 안에서 바로 답(DM으로 넘기지 않기). 상대 길이에 맞추기(짧은 댓글엔 3~8단어). 비판엔 맞는 부분 먼저 인정 후 입장. NOISE·악플은 reply를 빈 칸으로(무시/숨기기 권장). LEAD는 공개로 충분히 답하고 마지막 한 문장만 도움 제안.
QUESTION 중 여러 사람이 궁금할 만한 건 reelIdea에 "이 질문으로 릴스 만들기(공식 #16)" 한 줄.
형식: {"items":[{"who":"","comment":"","type":"SUPPORT","reply":"","reelIdea":""}],"summary":""}`,
    };
  if (tool === "profile")
    return {
      title: `프로필 점검 ${s(inp.handle, 40)}`.trim(),
      prompt: `${voiceText}\n[프로필 정보 — 캡처가 함께 있으면 캡처 우선] ${s(inp.text, 3000) || "(캡처만)"}\n[무엇을 하는 계정인지] ${s(inp.about, 600) || "(캡처에서 판단)"}
아래 12항목 채점표로 정직하게 채점하세요(후하게 주지 말 것, 처음엔 보통 30~40점대). 캡처에 안 보여 판단할 수 없는 항목은 score 0, seen=false로 두고 note에 '캡처에 안 보여요'.
${PROFILE_RUBRIC.map((r) => `- ${r.id} (${r.label}, ${r.points}점): 만점 기준 = ${r.full}`).join("\n")}
그리고 점수를 잃은 부분은 바로 쓸 수 있게 고쳐 쓰기: 이름 칸(30자 이내 2안), 소개글(150자 이내 2안), 하이라이트 이름 4~6개, 고정할 게시물 3개 역할 제안.
형식: {"items":[{"id":"name_field","score":0,"seen":true,"note":""}],"rewrites":{"name":[""],"bio":[""],"highlights":[""],"pinned":[""]},"top3":[""]}`,
    };
  if (tool === "plan")
    return {
      title: `주간 계획 ${s(inp.week, 30)}`.trim(),
      prompt: `${voiceText}\n[무엇을·누구에게] ${s(inp.offer, 800)}\n[알려지고 싶은 주제 3~4개] ${s(inp.themes, 800)}\n[이번 주 실제로 있었던 일 — 게시물 재료] ${s(inp.happened, 2000)}\n[보이고 싶은 계정들] ${s(inp.accounts, 1000) || "(없음)"}\n[주 시작일] ${s(inp.week, 30) || "이번 주"}
[후킹 공식]\n${hooks}
규칙: 주 4~5개 게시, 그중 3개 이상 릴스. 같은 종류 연달아 X. 종류: PROOF(숫자 있는 결과, 릴스, 주1) · TEACH(오늘 따라 할 한 가지, 릴스/캐러셀, 주1~2) · OPINION(의견, 릴스, 주1) · STORY(대가가 있는 장면, 격주) · OFFER(파는 것 담백하게, 격주).
각 칸은 '주제'가 아니라 이번 주 실제 일에서 나온 구체적인 각도. 시간은 소비자 대상이면 저녁(19~21시) 기준, 업무 대상이면 아침. 시간보다 첫 2초가 훨씬 중요하다는 점을 tip에 한 줄.
소통 목록: 매일 게시 전 20분, 노출 5·동료 3·고객 2 (입력한 계정이 있으면 그걸로, 없으면 어떤 계정을 찾을지 설명).
형식: {"days":[{"day":"월","time":"19:30","format":"릴스|캐러셀|스토리|소통만","type":"PROOF","formula":5,"angle":""}],"stories":"","engage":{"reach":[""],"peers":[""],"buyers":[""]},"tip":""}`,
    };
  // viral
  const ranked = rankOutliers(parseViralRows(s(inp.rows, 20000)));
  const top = ranked.filter((r) => r.posts >= 3 && r.multiple >= 3).slice(0, 12);
  return {
    title: `잘 된 영상 ${top.length}개`,
    ranked,
    top,
    prompt: `${voiceText}\n[내 분야] ${s(inp.niche, 600)}\n[계정 평소 조회수(중앙값)의 3배 넘게 나온 영상 — 앱이 계산]\n${top.map((r, i) => `${i + 1}. @${r.account} ${r.multiple}배 (조회 ${r.views}, 평소 ${r.median}) 첫 문장/내용: ${r.text || "(없음)"}`).join("\n")}
[후킹 공식]\n${hooks}
각 영상이 쓴 후킹 공식 번호와 왜 터졌는지 한 줄, 그리고 내 분야에 맞게 바꾼 첫 문장 2개. 마지막에 이번 달 가장 잘 먹히는 공식 1~3개 요약.
배수가 숫자를 대신 증명하지 않으니 '무조건 터진다' 같은 말 금지.
형식: {"items":[{"n":1,"formula":0,"why":"","mine":["",""]}],"summary":""}`,
  };
}

export async function runIgTool(input: { tool: string; blogId?: string | null; images?: string[]; [k: string]: unknown }) {
  if (!isIgTool(input.tool)) throw new Error("알 수 없는 도구예요.");
  const tool = input.tool;
  const inp = Object.fromEntries(Object.entries(input).filter(([k]) => !["tool", "blogId", "images", "confirm"].includes(k)).map(([k, v]) => [k, s(v, 20000)])) as Record<string, string>;
  const need: Record<IgTool, string> = { reel: "idea", reply: "comments", profile: "", plan: "happened", viral: "rows" };
  const images = (Array.isArray(input.images) ? input.images : []).map(String).filter((u) => /^data:image\/|^https:\/\//.test(u)).slice(0, 4);
  if (need[tool] && !inp[need[tool]]) throw new Error("내용을 먼저 넣어 주세요.");
  if (tool === "profile" && !images.length && !inp.text) throw new Error("프로필 캡처를 넣거나 프로필 내용을 붙여넣어 주세요.");
  const voice = await getVoice();
  const b = build(tool, inp, voice);
  if (tool === "viral" && !("top" in b && b.top?.length)) {
    throw new Error("평소보다 3배 넘게 나온 영상이 없어요. 계정마다 영상을 3개 이상 넣었는지 확인해 주세요. (계정 | 조회수 | 첫 문장)");
  }
  const blog = input.blogId ? await getBlogForAi(String(input.blogId)) : null;
  const system = `당신은 한국 인스타그램 계정을 운영해 주는 편집자입니다. 게시·발송은 사용자가 직접 합니다. JSON 객체 하나만 출력하세요.\n${HUMAN}`;
  const res = await runStep({ step: "carousel", purpose: `ig-${tool}`, blog, system, prompt: b.prompt, json: true, maxTokens: tool === "reply" ? 6000 : 4000, images: images.length ? images : undefined, retries: 0, noFallback: true });
  const raw = extractJson<Record<string, unknown>>(res.text);
  let result: Record<string, unknown> = raw;
  if (tool === "profile") {
    const got = new Map((Array.isArray(raw.items) ? raw.items : []).map((x: { id?: string; score?: number; seen?: boolean; note?: string }) => [x.id, x]));
    const items = PROFILE_RUBRIC.map((r) => {
      const g = got.get(r.id) ?? {};
      return { id: r.id, label: r.label, max: r.points, score: Math.max(0, Math.min(r.points, Math.round(Number(g.score) || 0))), seen: g.seen !== false, note: s(g.note, 400) };
    });
    result = { ...raw, items, total: items.reduce((a, x) => a + x.score, 0) };
  }
  if (tool === "reel") {
    const beats = Array.isArray(raw.beats) ? (raw.beats as { say?: string; screen?: string }[]) : [];
    let t = 0;
    result = { ...raw, beats: beats.map((x) => { const sec = Math.max(1, spokenSeconds(String(x.say ?? ""))); const r = { say: s(x.say, 400), screen: s(x.screen, 120), from: t, to: Math.round((t + sec) * 10) / 10 }; t = r.to; return r; }), seconds: t };
  }
  if (tool === "viral" && "ranked" in b) result = { ...raw, ranked: b.ranked!.slice(0, 60), top: b.top };
  const id = newId("igo_");
  await q("INSERT INTO ig_ops (id, tool, title, blog_id, input, result, model) VALUES ($1,$2,$3,$4,$5,$6,$7)", [id, tool, b.title || tool, input.blogId || null, j({ ...inp, imageCount: images.length }), j(result), `${res.provider}/${res.model}`]);
  return (await q1<IgRun>("SELECT id, tool, title, blog_id, input, result, model, created_at FROM ig_ops WHERE id=$1", [id]))!;
}
