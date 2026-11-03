import { listBlogs } from "@/lib/repo";
import NewProjectForm from "./NewProjectForm";

export const dynamic = "force-dynamic";

export default async function NewProject({ searchParams }: { searchParams: Promise<{ blog?: string }> }) {
  const sp = await searchParams;
  const blogs = await listBlogs();
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div>
          <h1>새 콘텐츠 프로젝트</h1>
          <p className="sub">주제를 등록하면 '주제 승인' 단계에서 시작합니다. 승인하면 기획안 작성이 자동 실행됩니다.</p>
        </div>
      </div>
      <NewProjectForm blogs={blogs.map((b) => ({ id: b.id, name: b.name, color: b.color }))} defaultBlog={sp.blog} />
    </div>
  );
}
