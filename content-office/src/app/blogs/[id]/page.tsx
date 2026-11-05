import Link from "next/link";
import { notFound } from "next/navigation";
import { getBlog } from "@/lib/repo";
import { connectionStatus } from "@/lib/ai/providers";
import BlogForm from "@/components/BlogForm";
import StyleSamples from "@/components/StyleSamples";
import BackButton from "@/components/BackButton";

export const dynamic = "force-dynamic";

export default async function BlogDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const connections = connectionStatus();
  if (id === "new") {
    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <BackButton href="/blogs" label="블로그 설정으로" />
        <div className="page-head"><div><h1>블로그 추가</h1><p className="sub">새 블로그의 문체·AI·검수 규칙을 설정하세요.</p></div></div>
        <BlogForm connections={connections} />
      </div>
    );
  }
  const blog = await getBlog(id);
  if (!blog) notFound();
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <BackButton href="/blogs" label="블로그 설정으로" />
      <div className="page-head">
        <div>
          <div className="small muted"><Link href="/blogs">블로그 설정</Link> /</div>
          <h1>{blog.name}</h1>
        </div>
        <div className="row">
          <Link className="btn btn-sm" href="/posts">진행 현황</Link>
          <Link className="btn btn-sm btn-primary" href="/new">글 만들기</Link>
        </div>
      </div>
      <div className="stack" style={{ gap: 16 }}>
        <StyleSamples blogId={blog.id} />
        <BlogForm blog={JSON.parse(JSON.stringify(blog))} connections={connections} />
      </div>
    </div>
  );
}
