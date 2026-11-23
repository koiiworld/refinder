import React from 'react';
import {Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {Video} from '@remotion/media';
import {C, manwon, won} from '../theme';
import {clamp, ease, Frame, Rise, TopBar} from './common';

export type ProductProps = {
  rank: number;
  brand: string;
  name: string;
  /** public/ 기준 경로 또는 https URL. 이미지(png/jpg) 또는 영상(mp4/mov/webm). 비우면 사진 자리 표시 */
  photo: string;
  returnPrice: number;
  newPrice: number;
  page: number;
  total: number;
};

const PhotoBox: React.FC<{photo: string}> = ({photo}) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        height: 590,
        borderRadius: 36,
        overflow: 'hidden',
        background: '#fff',
        position: 'relative',
        opacity: interpolate(f, [0, 14], [0, 1], clamp),
        scale: interpolate(f, [0, 22], [0.96, 1], {...clamp, easing: ease, output: 'perceptual-scale'}),
      }}
    >
      {/\.(mp4|mov|webm)$/i.test(photo) ? (
        // 영상 소재: 소리 없이 재생, 박스를 꽉 채움
        <Video
          src={/^https?:/.test(photo) ? photo : staticFile(photo)}
          muted
          style={{width: '100%', height: '100%', objectFit: 'cover'}}
        />
      ) : photo ? (
        <Img
          src={/^https?:/.test(photo) ? photo : staticFile(photo)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            padding: 40,
            scale: interpolate(f, [0, 180], [1.08, 1], {...clamp, easing: ease}),
          }}
        />
      ) : (
        <div
          style={{
            position: 'absolute', inset: 24, border: `3px dashed ${C.line}`, borderRadius: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, color: C.muted, fontWeight: 700,
          }}
        >
          상품 사진
        </div>
      )}
    </div>
  );
};

export const Product: React.FC<ProductProps> = (p) => {
  const f = useCurrentFrame();
  const disc = Math.round((1 - p.returnPrice / p.newPrice) * 100);
  const saved = p.newPrice - p.returnPrice;
  const ratio = p.returnPrice / p.newPrice;
  // 반품가 카운트다운: 새상품가 → 반품가
  const shown =
    Math.round(interpolate(f, [40, 76], [p.newPrice, p.returnPrice], {...clamp, easing: ease}) / 10) * 10;

  return (
    <Frame padBottom={80}>
      <TopBar page={p.page} total={p.total} />
      <div style={{marginTop: 20}}>
        <PhotoBox photo={p.photo} />
      </div>

      <Rise at={10} style={{marginTop: 30, display: 'flex', alignItems: 'baseline', gap: 14}}>
        <span style={{fontSize: 30, fontWeight: 900, color: C.accent}}>TOP {p.rank}</span>
        <span style={{fontSize: 28, fontWeight: 700, color: C.muted}}>{p.brand}</span>
      </Rise>
      <Rise at={14} style={{fontSize: 52, fontWeight: 800, marginTop: 4, lineHeight: 1.2}}>
        {p.name}
      </Rise>

      {/* 가격 카드 */}
      <Rise
        at={24}
        style={{
          marginTop: 'auto',
          background: C.card,
          borderRadius: 32,
          padding: '34px 44px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
          <span style={{fontSize: 26, fontWeight: 700, color: C.muted}}>쿠팡 새 상품가</span>
          <span style={{position: 'relative', fontSize: 34, fontWeight: 700, color: C.muted}}>
            {won(p.newPrice)}원
            <span
              style={{
                position: 'absolute', left: -5, right: -5, top: '52%', height: 4, background: C.accent,
                transformOrigin: 'left center',
                scale: `${interpolate(f, [30, 42], [0, 1], {...clamp, easing: ease})} 1`,
              }}
            />
          </span>
        </div>

        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14}}>
          <span style={{fontSize: 30, fontWeight: 800}}>반품마켓가</span>
          <span style={{fontSize: 80, fontWeight: 900, lineHeight: 1}}>
            {won(shown)}
            <span style={{fontSize: 42}}>원</span>
          </span>
        </div>

        {/* 비교 막대 */}
        <div style={{marginTop: 26, display: 'flex', flexDirection: 'column', gap: 10}}>
          <div style={{height: 16, borderRadius: 8, background: C.line}} />
          <div style={{height: 16, borderRadius: 8, background: C.bg, overflow: 'hidden'}}>
            <div
              style={{
                height: '100%', borderRadius: 8, background: C.accent,
                width: `${interpolate(f, [40, 76], [100, ratio * 100], {...clamp, easing: ease})}%`,
              }}
            />
          </div>
        </div>

        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 18, marginTop: 26,
            opacity: interpolate(f, [76, 84], [0, 1], clamp),
            scale: interpolate(f, [76, 90], [0.85, 1], {...clamp, easing: ease, output: 'perceptual-scale'}),
            transformOrigin: 'left center',
          }}
        >
          <span style={{background: C.accent, color: '#fff', fontSize: 46, fontWeight: 900, padding: '4px 20px', borderRadius: 16}}>
            -{disc}%
          </span>
          <span style={{fontSize: 38, fontWeight: 900}}>{manwon(saved)} 아껴요</span>
        </div>
      </Rise>
    </Frame>
  );
};
