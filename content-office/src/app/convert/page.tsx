import { q } from "@/lib/db";
import { listConversions } from "@/lib/convert";
import ConvertBoard from "./ConvertBoard";

export const dynamic = "force-dynamic";

export default async function ConvertPage() {
  const [rows, blogs] = await Promise.all([listConversions(), q<{ id: string; name: string }>("SELECT id, name FROM blogs WHERE NOT archived ORDER BY created_at, id")]);
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="page-head">
        <div>
          <h1>📄 문서 → 마크다운</h1>
          <p className="sub">PDF·워드·파워포인트·엑셀 파일을 글(마크다운)로 바꿔요. 마이크로소프트 MarkItDown 으로 맥에서 바꿔서 무료예요. 사진으로 스캔한 PDF는 글자를 뽑지 못해요. 바꾼 글은 복사하거나 .md 로 받고, 채널 변환·문체 샘플로 바로 보낼 수 있어요.</p>
        </div>
      </div>
      <ConvertBoard initial={JSON.parse(JSON.stringify(rows))} blogs={blogs} />
    </div>
  );
}
