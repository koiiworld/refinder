import Phase2Page from "@/components/Phase2Page";

export default function CarouselStudio() {
  return (
    <Phase2Page
      title="인스타그램 캐러셀 제작실"
      desc="블로그 원고를 인스타그램 캐러셀로 변환합니다."
      items={[
        "블로그 원고 → 슬라이드 자동 분할",
        "슬라이드별 이미지·문구 편집, 템플릿·폰트·색상 수정",
        "캡션·해시태그 생성",
        "이미지 파일(PNG) 내보내기",
        "Instagram Graph API(비즈니스 계정·앱 심사) 조건 충족 시 사용자 승인 후 발행",
      ]}
      now={["프로젝트의 '인스타 캐러셀' 단계는 '건너뛰기'로 최종 승인까지 진행할 수 있습니다.", "발행 패키지의 태그를 해시태그로 활용하세요."]}
    />
  );
}
