import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import {C, FONT} from '../theme';

export const ease = Easing.bezier(0.16, 1, 0.3, 1);

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

/** 아래에서 올라오며 나타나는 블록 */
export const Rise: React.FC<{
  at: number;
  dur?: number;
  dist?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({at, dur = 18, dist = 40, style, children}) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        opacity: interpolate(f, [at, at + dur], [0, 1], {...clamp, easing: ease}),
        translate: interpolate(f, [at, at + dur], [`0px ${dist}px`, '0px 0px'], {...clamp, easing: ease}),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Frame: React.FC<{children: React.ReactNode; bg?: string; padBottom?: number}> = ({children, bg = C.bg, padBottom = 110}) => (
  <AbsoluteFill
    style={{
      backgroundColor: bg,
      fontFamily: FONT,
      color: C.ink,
      padding: `110px 90px ${padBottom}px`,
      wordBreak: 'keep-all',
      letterSpacing: '-0.02em',
    }}
  >
    {children}
  </AbsoluteFill>
);

/** 상단 브랜드 바 + 페이지 표시 */
export const TopBar: React.FC<{page: number; total: number; dark?: boolean}> = ({page, total, dark}) => {
  const f = useCurrentFrame();
  const col = dark ? '#FFFFFF' : C.ink;
  return (
    <div
      style={{
        position: 'absolute',
        top: 64,
        left: 90,
        right: 90,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 30,
        fontWeight: 700,
        color: col,
        opacity: interpolate(f, [0, 12], [0, 1], clamp),
      }}
    >
      <span style={{letterSpacing: '0.02em'}}>
        RE<span style={{color: C.accent}}>FINDER</span>
      </span>
      <span style={{fontWeight: 500, opacity: 0.6}}>
        {page} / {total}
      </span>
    </div>
  );
};

/** 하단 스와이프 유도 */
export const SwipeHint: React.FC<{at: number; dark?: boolean; label?: string}> = ({at, dark, label = '옆으로 넘겨보기'}) => {
  const f = useCurrentFrame();
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 70,
        right: 90,
        fontSize: 30,
        fontWeight: 700,
        color: dark ? '#FFFFFF' : C.ink,
        display: 'flex',
        gap: 14,
        alignItems: 'center',
        opacity: interpolate(f, [at, at + 12], [0, 1], clamp),
      }}
    >
      {label}
      <span
        style={{
          display: 'inline-block',
          translate: `${Math.sin(((f - at) / 30) * Math.PI * 2) * 8}px 0px`,
          color: C.accent,
        }}
      >
        →
      </span>
    </div>
  );
};
