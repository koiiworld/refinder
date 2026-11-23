import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {C, manwon, won} from '../theme';
import {clamp, ease, Frame, Rise, SwipeHint, TopBar} from './common';

export type ProductProps = {
  rank: number;
  category: string;
  brand: string;
  name: string;
  option: string;
  returnPrice: number;
  newPrice: number;
  states: string[];
  oneLiner: string;
  page: number;
  total: number;
};

export const Product: React.FC<ProductProps> = (p) => {
  const f = useCurrentFrame();
  const disc = Math.round((1 - p.returnPrice / p.newPrice) * 100);
  const saved = p.newPrice - p.returnPrice;
  const ratio = p.returnPrice / p.newPrice;

  // 반품가 카운트다운: 새상품가 → 반품가
  const shown = Math.round(
    interpolate(f, [62, 100], [p.newPrice, p.returnPrice], {...clamp, easing: ease}) / 10,
  ) * 10;

  return (
    <Frame padBottom={150}>
      <TopBar page={p.page} total={p.total} />

      {/* 헤더: 순위 + 카테고리 */}
      <Rise at={2} style={{display: 'flex', alignItems: 'center', gap: 20, marginTop: 20}}>
        <span style={{fontSize: 44, fontWeight: 900, color: C.accent}}>TOP {p.rank}</span>
        <span
          style={{
            fontSize: 30,
            fontWeight: 700,
            border: `3px solid ${C.ink}`,
            borderRadius: 999,
            padding: '6px 20px',
          }}
        >
          {p.category}
        </span>
      </Rise>

      {/* 상품명 */}
      <Rise at={10} style={{marginTop: 36}}>
        <div style={{fontSize: 40, fontWeight: 700, color: C.muted}}>{p.brand}</div>
        <div style={{fontSize: 88, fontWeight: 900, lineHeight: 1.15, marginTop: 6}}>{p.name}</div>
        <div style={{fontSize: 36, fontWeight: 500, color: C.muted, marginTop: 14}}>{p.option}</div>
      </Rise>

      {/* 가격 카드 */}
      <Rise
        at={30}
        style={{
          marginTop: 'auto',
          background: C.card,
          borderRadius: 40,
          padding: '48px 54px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
          <span style={{fontSize: 34, fontWeight: 700, color: C.muted}}>쿠팡 새 상품가</span>
          <span style={{position: 'relative', fontSize: 46, fontWeight: 700, color: C.muted}}>
            {won(p.newPrice)}원
            <span
              style={{
                position: 'absolute',
                left: -6,
                right: -6,
                top: '52%',
                height: 5,
                background: C.accent,
                transformOrigin: 'left center',
                scale: `${interpolate(f, [46, 60], [0, 1], {...clamp, easing: ease})} 1`,
              }}
            />
          </span>
        </div>

        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 26}}>
          <span style={{fontSize: 38, fontWeight: 800}}>반품마켓가</span>
          <span style={{fontSize: 104, fontWeight: 900, lineHeight: 1, color: C.ink}}>
            {won(shown)}
            <span style={{fontSize: 56}}>원</span>
          </span>
        </div>

        {/* 비교 막대 */}
        <div style={{marginTop: 40, display: 'flex', flexDirection: 'column', gap: 14}}>
          <div style={{height: 22, borderRadius: 11, background: C.line}} />
          <div style={{height: 22, borderRadius: 11, background: C.bg, overflow: 'hidden'}}>
            <div
              style={{
                height: '100%',
                borderRadius: 11,
                background: C.accent,
                width: `${interpolate(f, [62, 100], [100, ratio * 100], {...clamp, easing: ease})}%`,
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 22,
            marginTop: 40,
            opacity: interpolate(f, [100, 110], [0, 1], clamp),
            scale: interpolate(f, [100, 116], [0.85, 1], {...clamp, easing: ease, output: 'perceptual-scale'}),
            transformOrigin: 'left center',
          }}
        >
          <span
            style={{
              background: C.accent,
              color: '#fff',
              fontSize: 64,
              fontWeight: 900,
              padding: '6px 26px',
              borderRadius: 20,
            }}
          >
            -{disc}%
          </span>
          <span style={{fontSize: 50, fontWeight: 900}}>{manwon(saved)} 아껴요</span>
        </div>
      </Rise>

      {/* 한줄평 + 상태 */}
      <Rise at={118} style={{marginTop: 34}}>
        <div style={{fontSize: 40, fontWeight: 700, lineHeight: 1.4}}>{p.oneLiner}</div>
      </Rise>
      <div style={{display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22}}>
        {p.states.map((s, i) => (
          <Rise key={s} at={128 + i * 5} dist={20}>
            <span
              style={{
                fontSize: 30,
                fontWeight: 700,
                background: C.accentSoft,
                color: C.accent,
                padding: '8px 18px',
                borderRadius: 12,
              }}
            >
              {s}
            </span>
          </Rise>
        ))}
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: 74,
          left: 90,
          fontSize: 24,
          fontWeight: 500,
          color: C.muted,
          opacity: interpolate(f, [130, 145], [0, 1], clamp),
        }}
      >
        2026.10.12 확인 기준 · 가격·재고는 바뀔 수 있어요
      </div>
      <SwipeHint at={150} />
    </Frame>
  );
};
