import { headers } from "next/headers";
import { extCode } from "@/proxy";
import CopyText from "./CopyText";

/** 🧩 크롬 확장 프로그램 연결: 앱 주소 + 연결 코드 + 설치 방법 (로그인한 사람만 보는 설정 화면) */
export default async function ExtensionCard() {
  const h = await headers();
  const app = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const pw = process.env.APP_PASSWORD?.trim();
  const code = pw ? await extCode(pw) : "(비밀번호 없이 쓰는 중이라 코드가 필요 없어요)";
  return (
    <section className="card">
      <div className="card-head"><h2>🧩 크롬 확장 프로그램 (ChatGPT·제미나이 → 앱)</h2></div>
      <div className="card-pad stack" style={{ gap: 10 }}>
        <p className="small" style={{ margin: 0 }}>
          ChatGPT·제미나이는 크롬에서 <b>내 아이디로 그대로</b> 쓰고, 답변·사진 옆 <b>📥 콘텐츠 오피스로</b> 버튼(또는 오른쪽 클릭 메뉴)으로 보내면 글 화면의 <b>📥 받은 글·사진</b>에 쌓여요. 보낸 기록은 작업 기록에 남고, 사진은 검수에도 반영돼요.
        </p>
        <div className="stack" style={{ gap: 4 }}>
          <div className="small"><b>앱 주소</b> <CopyText text={app} /></div>
          <div className="small"><b>연결 코드</b> <CopyText text={code} /></div>
          <span className="tiny muted">앱 비밀번호를 바꾸면 연결 코드도 바뀌어요. 그때는 확장 프로그램에 새 코드를 넣어 주세요.</span>
        </div>
        <details>
          <summary className="small" style={{ cursor: "pointer" }}><b>설치 방법 (처음 한 번)</b></summary>
          <ol className="small" style={{ margin: "6px 0 0", paddingLeft: 20, lineHeight: 1.8 }}>
            <li>크롬 주소창에 <code>chrome://extensions</code> 입력 → 오른쪽 위 <b>개발자 모드</b> 켜기</li>
            <li><b>압축해제된 확장 프로그램을 로드합니다</b> 누르기 → 맥의 <code>project/refinder/content-office/chrome-extension</code> 폴더 선택</li>
            <li>크롬 오른쪽 위 퍼즐 아이콘 → <b>콘텐츠 오피스 보내기</b> 📌 고정</li>
            <li>아이콘을 눌러 위의 <b>앱 주소</b>와 <b>연결 코드</b>를 붙여넣고 <b>연결 확인</b></li>
            <li>같은 창에서 <b>보낼 글</b>을 고르기 → ChatGPT·제미나이에서 보내기</li>
          </ol>
        </details>
      </div>
    </section>
  );
}
