import React from 'react';
import {Img, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {C, won} from '../theme';
import {clamp, ease, Frame, Rise, TopBar} from './common';

export type ProductProps = {
  rank: number;
  brand: string;
  name: string;
  /** public/ 기준 경로 또는 https URL. 비우면 사진 자리 표시 */
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
        height: 700,
        borderRadius: 36,
        overflow: 'hidden',
        background: '#fff',
        position: 'relative',
        opacity: interpolate(f, [0, 14], [0, 1], clamp),
        scale: interpolate(f, [0, 22], [0.96, 1], {...clamp, easing: ease, output: 'perceptual-scale'}),
      }}
    >
      {photo ? (
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
  const shown =
    Math.round(interpolate(f, [40, 76], [p.newPrice, p.returnPrice], {...clamp, easing: ease}) / 10) * 10;

  return (
    <Frame padBottom={90}>
      <TopBar page={p.page} total={p.total} />
      <div style={{marginTop: 20}}>
        <PhotoBox photo={p.photo} />
      </div>

      <Rise at={10} style={{marginTop: 44, display: 'flex', alignItems: 'baseline', gap: 16}}>
        <span style={{fontSize: 34, fontWeight: 900, color: C.accent}}>{p.rank}</span>
        <span style={{fontSize: 30, fontWeight: 700, color: C.muted}}>{p.brand}</span>
      </Rise>
      <Rise at={14} style={{fontSize: 58, fontWeight: 800, marginTop: 6, lineHeight: 1.2}}>
        {p.name}
      </Rise>

      <Rise at={24} style={{marginTop: 'auto'}}>
        <div style={{position: 'relative', display: 'inline-block', fontSize: 32, fontWeight: 600, color: C.muted}}>
          {won(p.newPrice)}원
          <span
            style={{
              position: 'absolute', left: -4, right: -4, top: '52%', height: 4, background: C.accent,
              transformOrigin: 'left center',
              scale: `${interpolate(f, [30, 42], [0, 1], {...clamp, easing: ease})} 1`,
            }}
          />
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 22, marginTop: 4}}>
          <span style={{fontSize: 80, fontWeight: 900, lineHeight: 1.05}}>
            {won(shown)}
            <span style={{fontSize: 44}}>원</span>
          </span>
          <span
            style={{
              background: C.accent, color: '#fff', fontSize: 40, fontWeight: 900, padding: '4px 18px', borderRadius: 14,
              opacity: interpolate(f, [76, 84], [0, 1], clamp),
              scale: interpolate(f, [76, 90], [0.7, 1], {...clamp, easing: ease, output: 'perceptual-scale'}),
            }}
          >
            -{disc}%
          </span>
        </div>
      </Rise>
    </Frame>
  );
};
