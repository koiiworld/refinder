import React from 'react';
import {Composition, Folder} from 'remotion';
import './theme';
import {Cover} from './slides/Cover';
import {Outro} from './slides/Outro';
import {Product} from './slides/Product';
import {PhotoSlide} from './photo/PhotoSlide';

// 인스타그램 세로 캐러셀 4:5 (1080x1350)
const W = 1080;
const H = 1350;
const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
    {/* 사진 꽉 채우는 제품 나열형. posts/*.json 으로 렌더링 (render-post.mjs) */}
    <Composition
      id="PhotoSlide"
      component={PhotoSlide}
      durationInFrames={5 * FPS}
      fps={FPS}
      width={W}
      height={H}
      calculateMetadata={({props}) => ({durationInFrames: (props.slide.kind === 'outro' ? 4 : 5) * FPS})}
      defaultProps={{
        account: 'refinder',
        slide: {kind: 'item', media: 'demo/item1.jpg', brand: '오이코이홈', product: '조각별을 품은 고양이 냄비받침', price: '19,000원', comment: '고양이 수염도 조각 별도 귀여운 냄비받침, 냉장고에 톡 걸어보세요!'},
      }}
    />
    <Folder name="Carousel-Digital">
      <Composition
        id="S01-Cover"
        component={Cover}
        durationInFrames={4 * FPS}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={{
          kicker: '쿠팡 반품마켓',
          line1: '새 상품 대신',
          line2: '반품으로 사면',
          highlight: '최대 52만원↓',
          sub: '반품마켓 디지털 기기 TOP 5',
          total: 7,
        }}
      />
      <Composition
        id="S02-ZFlip7"
        component={Product}
        durationInFrames={4 * FPS}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={{
          rank: 1,
          brand: '삼성전자',
          name: '갤럭시 Z플립7',
          returnPrice: 1119990,
          newPrice: 1643400,
          photo: 'products/zflip7.png',
          page: 2,
          total: 7,
        }}
      />
      <Composition
        id="S03-GalaxyRing"
        component={Product}
        durationInFrames={4 * FPS}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={{
          rank: 2,
          brand: '삼성전자',
          name: '갤럭시 링',
          returnPrice: 318110,
          newPrice: 499400,
          photo: 'products/galaxy-ring.png',
          page: 3,
          total: 7,
        }}
      />
      <Composition
        id="S04-BelkinStand"
        component={Product}
        durationInFrames={4 * FPS}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={{
          rank: 3,
          brand: '벨킨',
          name: '부스트업 프로 3in1 맥세이프 스탠드',
          returnPrice: 68000,
          newPrice: 135990,
          photo: 'products/belkin-wiz017.png',
          page: 4,
          total: 7,
        }}
      />
      <Composition
        id="S05-XiaomiBattery"
        component={Product}
        durationInFrames={4 * FPS}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={{
          rank: 4,
          brand: '샤오미',
          name: '212W 초고속 보조배터리',
          returnPrice: 95610,
          newPrice: 129000,
          photo: 'products/xiaomi-212w.png',
          page: 5,
          total: 7,
        }}
      />
      <Composition
        id="S06-SilkPencil"
        component={Product}
        durationInFrames={4 * FPS}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={{
          rank: 5,
          brand: '실크펜슬',
          name: 'V4 무선충전 펜슬',
          returnPrice: 13300,
          newPrice: 24480,
          photo: '',
          page: 6,
          total: 7,
        }}
      />
      <Composition
        id="S07-Outro"
        component={Outro}
        durationInFrames={5 * FPS}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={{
          title1: '다른 반품 특가도',
          title2: '검색해서 찾아보세요',
          cta: '프로필 링크에서 검색 →',
          tips: ['최상 등급은 사용 흔적 거의 없음', '구매 전 상태 설명 꼭 확인'],
          disclosure:
            '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.\n가격은 2026.10.12 확인 기준이며 수시로 바뀔 수 있습니다.',
          total: 7,
        }}
      />
    </Folder>
    </>
  );
};
