import ThumbFactory from "./ThumbFactory";

export const dynamic = "force-dynamic";

export default function ThumbsPage() {
  return (
    <div className="page" style={{ maxWidth: 1400 }}>
      <div className="page-head">
        <div>
          <h1>🖼 썸네일 공장</h1>
          <p className="sub">사진을 올리고 내 스티커·글자로 꾸며 블로그 썸네일을 만들어요. 템플릿으로 위치·글꼴·캐릭터 크기를 모든 사진에 똑같이 맞출 수 있어요. AI를 쓰지 않아 무료예요.</p>
        </div>
      </div>
      <ThumbFactory />
    </div>
  );
}
