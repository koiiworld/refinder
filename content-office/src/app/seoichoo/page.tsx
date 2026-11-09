import {headers} from 'next/headers';
import {listBlogs} from '@/lib/repo';
import {extCode} from '@/proxy';
import CopyText from '../settings/CopyText';
import Board from './SeoBoard';
export const dynamic='force-dynamic';
export default async function Page(){
 const h=await headers(),pw=process.env.APP_PASSWORD?.trim();
 const app=`${h.get('x-forwarded-proto')??'https'}://${h.get('x-forwarded-host')??h.get('host')}`;
 return <div className="page stack"><div><h1>서이추 관리</h1><p className="sub">웹에서 준비하고, 평소 사용하는 크롬의 네이버 로그인으로 실행해요.</p></div>
 <section className="card card-pad stack"><h2>크롬 확장 프로그램 연결</h2><p className="small">크롬에 확장 프로그램을 설치하고 네이버에 직접 로그인해 주세요. 신청 전 확장 프로그램 실행창에서 다시 확인해요. AI 호출 비용은 없어요.</p>
 <div className="row"><a className="btn" href="/api/extension-zip">확장 프로그램 받기 (ZIP)</a></div>
 <div>앱 주소 <CopyText text={app}/></div><div>연결 코드 <CopyText text={pw?await extCode(pw):''}/></div><p className="tiny muted">ZIP을 압축 풀고 chrome://extensions에서 개발자 모드 → 압축해제된 확장 프로그램 로드로 설치하세요. 기존 확장 프로그램을 쓰면 새 파일로 교체 후 새로고침하세요. 확장 아이콘에서 주소·코드를 연결한 뒤 ‘서이추 실행창’을 여세요. 크롬과 실행창을 켜 두어야 해요. 연결 코드는 다른 사람에게 공유하지 마세요.</p></section>
 <Board blogs={(await listBlogs()).filter(b=>b.platform==='naver').map(b=>({id:b.id,name:b.name}))}/></div>;
}
