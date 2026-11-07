import { notFound } from "next/navigation";
import { LEARN_CATEGORIES } from "@/lib/carousel-design-types";
import LearningBoard from "../LearningBoard";
export const dynamic = "force-dynamic";
export default async function LearnCategory({params}:{params:Promise<{category:string}>}) {
  const {category}=await params; const c=LEARN_CATEGORIES.find(x=>x.id===category); if(!c) notFound();
  return <div className="page stack"><div className="page-head"><div><h1>📚 {c.label} 학습</h1><p className="sub">{c.description}</p></div></div><LearningBoard category={c.id}/></div>;
}
