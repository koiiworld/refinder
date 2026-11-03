import Link from "next/link";
import { notFound } from "next/navigation";
import { getBlog } from "@/lib/repo";
import { connectionStatus } from "@/lib/ai/providers";
import BlogForm from "@/components/BlogForm";

export const dynamic = "force-dynamic";

export default async function BlogDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const connections = connectionStatus();
  if (id === "new") {
    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <div className="page-head"><div><h1>블로그 추가</h1><p className="sub">새 블로그의 문체·AI·검수 규칙을 설정하세요.</p></div></div>
        <BlogForm connections={connections} />
      </div>
    );
  }
  const blog = await getBlog(id);
  if (!blog) notFound();
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-head">
        <div>
          <div className="small muted"><Link href="/blogs">블로그 관리</Link> /</div>
          <h1>{blog.name}</h1>
        </div>
        <div className="row">
          <Link className="btn btn-sm" href={`/projects?blog=${blog.id}`}>프로젝트 보기</Link>
          <Link className="btn btn-sm btn-primary" href={`/projects/new?blog=${blog.id}`}>+ 새 글</Link>
        </div>
      </div>
      <BlogForm blog={JSON.parse(JSON.stringify(blog))} connections={connections} />
    </div>
  );
}
