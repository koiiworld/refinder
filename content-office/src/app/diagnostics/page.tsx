import Phase2Page from "@/components/Phase2Page";

export default function Diagnostics() {
  return (
    <Phase2Page
      title="블로그 진단실"
      desc="검색 노출·색인·클릭을 분석하고 개선 권고를 관리합니다. 확인된 오류와 추정 원인을 구분하며, 검색 순위 회복을 보장하지 않습니다."
      items={[
        "Google Search Console 연동 (OAuth 사용자 승인 필요)",
        "검색 노출·색인·클릭 분석",
        "기술적 SEO 점검 (메타태그, 구조화 데이터, 속도 등)",
        "게시글 콘텐츠 품질 검토",
        "검색 노출 감소 원인 조사 — '확인된 오류'와 '추정 원인' 분리 표기",
        "개선 권고 및 재점검 이력 관리",
      ]}
      now={["Search Console 연동에는 Google 계정 로그인 승인이 필요해 1차 범위에서 제외했습니다."]}
    />
  );
}
