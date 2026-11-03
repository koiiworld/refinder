import Phase2Page from "@/components/Phase2Page";

export default function ImagesStudio() {
  return (
    <Phase2Page
      title="이미지 스튜디오"
      desc="원고에 맞는 이미지 컷을 기획하고 AI로 생성·편집합니다."
      items={[
        "원고·기획안의 이미지 계획으로 이미지 컷 자동 기획",
        "AI 이미지 생성 및 편집 (OpenAI·Google 이미지 API)",
        "개별 이미지 승인·반려·재생성",
        "블로그별 이미지 스타일 적용 (블로그 설정에 이미 저장 가능)",
        "이미지 프롬프트 및 버전 관리",
        "본문 내 이미지 자동 배치",
      ]}
      now={[
        "기획안의 '이미지 제작 계획'에서 컷 목록 확인·수정",
        "원고 편집기에서 이미지 URL 삽입 또는 파일 업로드(3MB 이하)",
        "이미지 단계에서 '이미지 작업 완료' 후 이미지 승인",
      ]}
    />
  );
}
