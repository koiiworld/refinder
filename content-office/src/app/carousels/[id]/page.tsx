import { notFound } from "next/navigation";
import { getCarousel } from "@/lib/carousel";
import { listBlogs } from "@/lib/repo";
import { recentPosts } from "@/lib/blog-posts";
import Studio from "../studio/Studio";

import PostedButton from "@/components/PostedButton";

export const dynamic = "force-dynamic";

export default async function CarouselPage({ params }: { params: Promise<{ id: string }> }) {
  const c = await getCarousel((await params).id);
  if (!c) notFound();
  const blogs = (await listBlogs()).filter((b) => !c.blog_id || b.id === c.blog_id);
  const recent = (await Promise.all(blogs.map(async (b) => (await recentPosts(b, 50)).map((p) => ({ title: p.title, url: p.url, blog: b.name }))))).flat();
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <a href="/carousels" className="small" style={{ color: "var(--accent)" }}>← 캐러셀 목록</a>
          <h1>📱 {c.title}</h1>
          <p className="sub">장마다 글자·사진·도형을 놓고 움직임을 걸어요. 고친 장만 MP4로 다시 뽑을 수 있어요.</p>
        </div>
        <PostedButton type="carousel" id={c.id} postedAt={(c as { posted_at?: string | null }).posted_at ?? null} />
      </div>
      <Studio initial={JSON.parse(JSON.stringify(c))} recent={recent} />
    </div>
  );
}
