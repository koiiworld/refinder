import { listBlogs } from "@/lib/repo";
import { listPrompts } from "@/lib/promptlab";
import { connectionStatus } from "@/lib/ai/providers";
import PromptLab from "./PromptLab";

export const dynamic = "force-dynamic";

export default async function PromptsPage() {
  const [blogs, prompts] = await Promise.all([listBlogs(), listPrompts()]);
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>프롬프트 수정실</h1>
          <p className="sub">대상 AI와 용도에 맞춰 프롬프트를 다듬고, 수정 이력을 저장합니다. 결과는 복사해서 각 서비스에 붙여 넣으세요.</p>
        </div>
      </div>
      <PromptLab
        blogs={blogs.map((b) => ({ id: b.id, name: b.name, color: b.color }))}
        initial={JSON.parse(JSON.stringify(prompts))}
        connections={connectionStatus()}
      />
    </div>
  );
}
