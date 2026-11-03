import { connectionStatus } from "@/lib/ai/providers";
import { dbKind } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { naverConnected } from "@/lib/research";
import { listBlogs } from "@/lib/repo";
import SettingsClient from "./SettingsClient";

export const dynamic = "force-dynamic";

const FEATURES: [string, "ok" | "partial" | "todo", string][] = [
  ["멀티 블로그 관리 (문체·AI·이미지 스타일·검수 규칙 독립)", "ok", "블로그 추가/수정/보관"],
  ["통합 대시보드 · 승인 대기함 · 캘린더 · AI 비용/실행 내역", "ok", ""],
  ["프로젝트 생성 → 승인형 자동화 워크플로", "ok", "승인 시 다음 AI 작업 자동 실행, 서버 큐·재시도"],
  ["기획실 (SEO 제목·키워드·검색의도·목차·출처·이미지 계획)", "ok", "AI 연결 필요 (미연결 시 템플릿)"],
  ["AI 원고실 (역할 배정·작성·교차 검수·버전)", "ok", "OpenAI/Anthropic/Google 공식 API"],
  ["WYSIWYG 에디터 · 자동 저장 · 부분 AI 수정 · 전후 비교 · 복원", "ok", ""],
  ["사용자 수정 보호 · 승인 후 변경 재검수", "ok", ""],
  ["발행 패키지 내보내기 (HTML·MD·JSON) · 전체 백업", "ok", ""],
  ["글감 직접 등록 · 경쟁 콘텐츠 URL 수집 · AI 글감 추천", "ok", "AI 추천은 AI 연결 필요"],
  ["프롬프트 수정실 (GPT·Claude·Gemini·Higgsfield × 이미지/영상·글·정보)", "ok", "다듬기는 AI 연결 필요, 지침은 항상 표시"],
  ["검색어 트렌드 (네이버 데이터랩 공식 API)", "partial", "코드 구현, API 키 필요"],
  ["이미지 스튜디오 (AI 이미지 생성·승인·재생성)", "todo", "2차 · 현재는 에디터에서 직접 이미지 삽입"],
  ["인스타그램 캐러셀 제작실 · 발행", "todo", "2차"],
  ["블로그 진단실 (Search Console 연동)", "todo", "2차"],
  ["블로그 자동 발행", "todo", "티스토리 API 종료·네이버 글쓰기 API 없음 → 패키지 수동 발행"],
];

export default async function SettingsPage() {
  const [kind, settings, blogs] = await Promise.all([dbKind(), getSettings(), listBlogs()]);
  const models = new Set<string>();
  for (const b of blogs) for (const a of Object.values(b.ai_roles)) if (a && a.provider !== "template") models.add(`${a.provider}:${a.model}`);
  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <div className="page-head">
        <div>
          <h1>설정 · AI 연결</h1>
          <p className="sub">API 키는 서버 환경 변수로만 관리되며 DB·브라우저·내보내기 파일에 저장되지 않습니다.</p>
        </div>
      </div>
      {kind === "pglite" && process.env.RENDER && (
        <div className="notice notice-bad" style={{ marginBottom: 16 }}>
          배포 서버에서 내장 DB를 쓰고 있습니다. 무료 서버 디스크는 재시작 시 지워지므로 데이터가 사라집니다. DATABASE_URL(Supabase)을 설정하세요.
        </div>
      )}
      <SettingsClient
        connections={connectionStatus()}
        settings={settings}
        usedModels={Array.from(models)}
        db={kind}
        naver={naverConnected()}
      />
      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-head"><h2>기능 구현 현황</h2></div>
        <div className="list">
          {FEATURES.map(([name, st, note]) => (
            <div key={name} className="list-item" style={{ alignItems: "flex-start" }}>
              <span className={`badge ${st === "ok" ? "badge-ok" : st === "partial" ? "badge-warn" : ""}`} style={{ minWidth: 64, justifyContent: "center" }}>
                {st === "ok" ? "작동" : st === "partial" ? "연결 필요" : "미구현"}
              </span>
              <div style={{ flex: 1 }}>
                <div className="small">{name}</div>
                {note && <div className="tiny muted">{note}</div>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
