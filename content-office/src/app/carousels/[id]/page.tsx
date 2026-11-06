import { notFound } from "next/navigation";
import { CONTENT_TYPES, getCarousel } from "@/lib/carousel";
import { listBlogs } from "@/lib/repo";
import { recentPosts } from "@/lib/blog-posts";
import CarouselEditor from "./CarouselEditor";

export const dynamic = "force-dynamic";

export default async function CarouselPage({ params }: { params: Promise<{ id: string }> }) {
  const c = await getCarousel((await params).id);
  if (!c) notFound();
  const blogs = (await listBlogs()).filter((b) => !c.blog_id || b.id === c.blog_id);
  const recent = (await Promise.all(blogs.map(async (b) => (await recentPosts(b, 15)).map((p) => ({ title: p.title, url: p.url, blog: b.name }))))).flat();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <a href="/carousels" className="small" style={{ color: "var(--accent)" }}>← 캐러셀 목록</a>
          <h1>📱 {c.title}</h1>
          <p className="sub">글자를 고치면 미리보기가 바로 바뀌어요. 다 되면 &apos;사진에 저장·공유&apos;로 폰 사진 앱에 저장한 뒤 인스타에 순서대로 올리세요.</p>
        </div>
      </div>
      <CarouselEditor initial={JSON.parse(JSON.stringify(c))} recent={recent} types={CONTENT_TYPES.map((t) => ({ id: t.id, label: t.label, range: t.range }))} />
    </div>
  );
}
